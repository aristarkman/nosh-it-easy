import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { supabaseAdmin as SupabaseAdminClient } from "@/integrations/supabase/client.server";

// Sends via the send-marketing-email Supabase Edge Function, which calls
// Resend directly -- the same email provider already proven working for
// order confirmations (send-order-confirmation). Simpler and more reliable
// than routing through GHL's contact-upsert + template-merge-field dance:
// no external template setup required, no dependency on a third-party
// CRM's send API behaving a particular way.

type AdminClient = typeof SupabaseAdminClient;

async function requireAdmin(accessToken: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(accessToken);
  if (userErr || !userData?.user) return { ok: false as const, error: "Not authenticated" };
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  const isAdmin = (roles ?? []).some((r) => r.role === "admin");
  if (!isAdmin) return { ok: false as const, error: "Admin only" };
  return { ok: true as const, supabaseAdmin };
}

const ContentSchema = z.object({
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(20000),
  contentType: z.enum(["text", "html"]).default("text"),
  ctaLabel: z.string().max(60).optional(),
  ctaUrl: z.string().url().optional(),
});
type Content = z.infer<typeof ContentSchema>;

async function sendOneEmail(
  supabaseAdmin: AdminClient,
  input: Content & { to: string; oneClickUnsubscribe: boolean },
) {
  const { data, error } = await supabaseAdmin.functions.invoke("send-marketing-email", {
    body: {
      to: input.to,
      subject: input.subject,
      message: input.message,
      contentType: input.contentType,
      ctaLabel: input.ctaLabel ?? null,
      ctaUrl: input.ctaUrl ?? null,
      includeOneClickUnsubscribe: input.oneClickUnsubscribe,
    },
  });
  if (error) throw error;
  if (data && (data as { ok?: boolean }).ok === false) {
    throw new Error((data as { error?: string }).error ?? "Send failed");
  }
}

const AudienceSchema = z.object({ accessToken: z.string().min(1) });

export const getMarketingEmailAudienceCount = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AudienceSchema.parse(input))
  .handler(async ({ data }) => {
    const admin = await requireAdmin(data.accessToken);
    if (!admin.ok) return { ok: false as const, error: admin.error };
    const { count, error } = await admin.supabaseAdmin
      .from("customer_profiles")
      .select("user_id", { count: "exact", head: true })
      .eq("marketing_email", true)
      .not("email", "is", null);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, count: count ?? 0 };
  });

const MAX_BLAST_RECIPIENTS = 2000;
const BLAST_CONCURRENCY = 5;

async function runBlast(
  supabaseAdmin: AdminClient,
  recipients: Array<{ email: string }>,
  content: Content,
  oneClickUnsubscribe: boolean,
) {
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < recipients.length; i += BLAST_CONCURRENCY) {
    const batch = recipients.slice(i, i + BLAST_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (r) => {
        try {
          await sendOneEmail(supabaseAdmin, { ...content, to: r.email, oneClickUnsubscribe });
          return true;
        } catch (err) {
          console.error("marketing email blast failed:", r.email, err);
          return false;
        }
      }),
    );
    for (const ok of results) {
      if (ok) sent++;
      else failed++;
    }
  }
  return { sent, failed };
}

const OptedInBlastSchema = z.object({ accessToken: z.string().min(1) }).merge(ContentSchema);

// Sends to customer_profiles rows with marketing_email = true -- the app's
// own opted-in list (account settings toggle). Gets a real one-click
// unsubscribe link, since we can flip their stored preference directly.
export const sendMarketingEmailBlastToOptedIn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => OptedInBlastSchema.parse(input))
  .handler(async ({ data }) => {
    const admin = await requireAdmin(data.accessToken);
    if (!admin.ok) return { ok: false as const, error: admin.error };

    const { data: rows, error } = await admin.supabaseAdmin
      .from("customer_profiles")
      .select("email")
      .eq("marketing_email", true)
      .not("email", "is", null)
      .limit(MAX_BLAST_RECIPIENTS);
    if (error) return { ok: false as const, error: error.message };

    const recipients = (rows ?? []).filter((r): r is { email: string } => !!r.email);

    const { sent, failed } = await runBlast(admin.supabaseAdmin, recipients, data, true);
    return {
      ok: true as const,
      audience: recipients.length,
      sent,
      failed,
      truncated: recipients.length >= MAX_BLAST_RECIPIENTS,
    };
  });

const ListBlastSchema = z
  .object({
    accessToken: z.string().min(1),
    contacts: z
      .array(z.object({ email: z.string().email(), name: z.string().max(120).optional() }))
      .min(1)
      .max(MAX_BLAST_RECIPIENTS),
  })
  .merge(ContentSchema);

// Sends to a client-supplied list (e.g. a CSV import from GloriaFood or
// another external source) -- never persisted into customer_profiles,
// since these people never opted in through this app. No persistent
// record to flip means no one-click unsubscribe; they get a
// reply-to-unsubscribe instruction in the email instead.
export const sendMarketingEmailBlastToList = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ListBlastSchema.parse(input))
  .handler(async ({ data }) => {
    const admin = await requireAdmin(data.accessToken);
    if (!admin.ok) return { ok: false as const, error: admin.error };

    const seen = new Set<string>();
    const recipients = data.contacts
      .map((c) => ({ email: c.email.trim().toLowerCase() }))
      .filter((c) => {
        if (seen.has(c.email)) return false;
        seen.add(c.email);
        return true;
      });

    const { sent, failed } = await runBlast(admin.supabaseAdmin, recipients, data, false);
    return { ok: true as const, audience: recipients.length, sent, failed, truncated: false };
  });
