import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Reuses the exact GHL pattern already proven in cart-abandonment.ts:
// upsert contact -> send via a pre-built template, with the actual message
// body injected as a per-contact custom field ({{contact.custom.blast_message}}
// in the template). This is deliberately NOT a raw-HTML send -- GHL's
// contact-based send API is template-oriented, and reusing the same shape
// as the already-working abandoned-cart email is far more reliable than
// guessing at an ad-hoc-HTML field that hasn't been tested against this
// account.
//
// ONE-TIME SETUP REQUIRED IN GHL before this works:
// Create an email template (Marketing -> Emails -> Templates) containing
// your branding, a physical mailing address, and an unsubscribe link/footer
// (required for CAN-SPAM compliance -- GHL does not necessarily add this
// automatically for template sends triggered via this API path, unlike its
// own bulk/campaign tool). Inside the template body, place the merge tag
// {{contact.custom.blast_message}} where the composed message should
// appear. Then set GHL_BLAST_TEMPLATE_ID to that template's ID.

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

async function sendGhlBlastEmail(input: {
  email: string;
  name: string | null;
  subject: string;
  message: string;
  tag: string;
}) {
  const ghlKey = process.env.GHL_API_KEY;
  const ghlLocation = process.env.GHL_LOCATION_ID;
  const templateId = process.env.GHL_BLAST_TEMPLATE_ID;
  if (!ghlKey || !ghlLocation) throw new Error("GHL not configured");
  if (!templateId) throw new Error("GHL_BLAST_TEMPLATE_ID not set -- see setup note in this file");

  const [firstName, ...rest] = (input.name ?? "").trim().split(/\s+/);
  const lastName = rest.join(" ") || undefined;

  const contactRes = await fetch("https://services.leadconnectorhq.com/contacts/upsert", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ghlKey}`,
      Version: "2021-07-28",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      locationId: ghlLocation,
      email: input.email,
      firstName: firstName || undefined,
      lastName,
      tags: [input.tag],
      customFields: [{ key: "blast_message", field_value: input.message }],
    }),
  });
  if (!contactRes.ok)
    throw new Error(`GHL contact upsert ${contactRes.status}: ${await contactRes.text()}`);
  const contactJson = (await contactRes.json()) as { contact?: { id?: string }; id?: string };
  const contactId = contactJson?.contact?.id ?? contactJson?.id;
  if (!contactId) throw new Error("GHL contact upsert: no id returned");

  const msgRes = await fetch("https://services.leadconnectorhq.com/conversations/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ghlKey}`,
      Version: "2021-04-15",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      type: "Email",
      contactId,
      subject: input.subject,
      emailTemplateId: templateId,
    }),
  });
  if (!msgRes.ok) throw new Error(`GHL email send ${msgRes.status}: ${await msgRes.text()}`);
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
  recipients: Array<{ email: string; name: string | null }>,
  subject: string,
  message: string,
  tag: string,
) {
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < recipients.length; i += BLAST_CONCURRENCY) {
    const batch = recipients.slice(i, i + BLAST_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (r) => {
        try {
          await sendGhlBlastEmail({ email: r.email, name: r.name, subject, message, tag });
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

const OptedInBlastSchema = z.object({
  accessToken: z.string().min(1),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(20000),
});

// Sends to customer_profiles rows with marketing_email = true -- the app's
// own opted-in list (account settings toggle).
export const sendMarketingEmailBlastToOptedIn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => OptedInBlastSchema.parse(input))
  .handler(async ({ data }) => {
    const admin = await requireAdmin(data.accessToken);
    if (!admin.ok) return { ok: false as const, error: admin.error };

    const { data: rows, error } = await admin.supabaseAdmin
      .from("customer_profiles")
      .select("email,full_name")
      .eq("marketing_email", true)
      .not("email", "is", null)
      .limit(MAX_BLAST_RECIPIENTS);
    if (error) return { ok: false as const, error: error.message };

    const recipients = (rows ?? [])
      .filter((r): r is { email: string; full_name: string | null } => !!r.email)
      .map((r) => ({ email: r.email, name: r.full_name }));

    const { sent, failed } = await runBlast(
      recipients,
      data.subject,
      data.message,
      "marketing-blast",
    );
    return {
      ok: true as const,
      audience: recipients.length,
      sent,
      failed,
      truncated: recipients.length >= MAX_BLAST_RECIPIENTS,
    };
  });

const ListBlastSchema = z.object({
  accessToken: z.string().min(1),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(20000),
  contacts: z
    .array(z.object({ email: z.string().email(), name: z.string().max(120).optional() }))
    .min(1)
    .max(MAX_BLAST_RECIPIENTS),
  tag: z.string().min(1).max(60).default("imported-list"),
});

// Sends to a client-supplied list (e.g. a CSV import from GloriaFood or
// another external source) rather than the app's own customer_profiles
// table -- these people never opted in through this app, so they're never
// persisted into customer_profiles; GHL is the system of record for them.
export const sendMarketingEmailBlastToList = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ListBlastSchema.parse(input))
  .handler(async ({ data }) => {
    const admin = await requireAdmin(data.accessToken);
    if (!admin.ok) return { ok: false as const, error: admin.error };

    const seen = new Set<string>();
    const recipients = data.contacts
      .map((c) => ({ email: c.email.trim().toLowerCase(), name: c.name?.trim() || null }))
      .filter((c) => {
        if (seen.has(c.email)) return false;
        seen.add(c.email);
        return true;
      });

    const { sent, failed } = await runBlast(recipients, data.subject, data.message, data.tag);
    return { ok: true as const, audience: recipients.length, sent, failed, truncated: false };
  });
