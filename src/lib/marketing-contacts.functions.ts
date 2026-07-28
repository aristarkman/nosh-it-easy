import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Stored marketing audience (e.g. a GloriaFood customer export) plus
// warm-up "drip" campaigns that send a capped batch per day instead of
// blasting the whole list at once.

const ContactSchema = z.object({
  email: z.string().email().max(200),
  firstName: z.string().max(80).optional(),
  lastName: z.string().max(80).optional(),
  phone: z.string().max(40).optional(),
  lastOrderAt: z.string().max(40).optional(),
});

const ImportSchema = z.object({
  accessToken: z.string().min(1),
  source: z.string().max(40).default("gloriafood"),
  contacts: z.array(ContactSchema).min(1).max(10000),
});

export const importMarketingContacts = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ImportSchema.parse(input))
  .handler(async ({ data }) => {
    const { requireAdminByToken } = await import("@/server/admin-guard.server");
    const admin = await requireAdminByToken(data.accessToken);
    if (!admin.ok) return { ok: false as const, error: admin.error };
    const db = admin.supabaseAdmin;

    const seen = new Set<string>();
    const rows: Array<Record<string, unknown>> = [];
    let duplicates = 0;
    let roleAddresses = 0;

    for (const c of data.contacts) {
      const email = c.email.trim().toLowerCase();
      const local = email.split("@")[0];
      // Role addresses are complaint/bounce magnets and rarely a real person.
      if (["info", "admin", "no-reply", "noreply", "support", "sales", "office"].includes(local)) {
        roleAddresses++;
        continue;
      }
      if (seen.has(email)) {
        duplicates++;
        continue;
      }
      seen.add(email);
      const parsedDate = c.lastOrderAt ? new Date(c.lastOrderAt) : null;
      rows.push({
        email,
        first_name: c.firstName?.trim() || null,
        last_name: c.lastName?.trim() || null,
        phone: c.phone?.trim() || null,
        source: data.source,
        last_order_at:
          parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null,
      });
    }

    // Skip anyone already stored (keeps their unsubscribe/bounce state intact).
    const { data: existing } = await db.from("marketing_contacts").select("email");
    const existingSet = new Set((existing ?? []).map((r) => r.email.toLowerCase()));
    const fresh = rows.filter((r) => !existingSet.has(String(r.email)));
    const alreadyStored = rows.length - fresh.length;

    let inserted = 0;
    for (let i = 0; i < fresh.length; i += 500) {
      const chunk = fresh.slice(i, i + 500);
      const { error } = await db.from("marketing_contacts").insert(chunk as never);
      if (error) return { ok: false as const, error: error.message };
      inserted += chunk.length;
    }

    return { ok: true as const, inserted, alreadyStored, duplicates, roleAddresses };
  });

const TokenOnly = z.object({ accessToken: z.string().min(1) });

export const getMarketingOverview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TokenOnly.parse(input))
  .handler(async ({ data }) => {
    const { requireAdminByToken } = await import("@/server/admin-guard.server");
    const admin = await requireAdminByToken(data.accessToken);
    if (!admin.ok) return { ok: false as const, error: admin.error };
    const db = admin.supabaseAdmin;

    const counted = async (build: (q: any) => any) => {
      const { count } = await build(
        db.from("marketing_contacts").select("id", { count: "exact", head: true }),
      );
      return count ?? 0;
    };

    const total = await counted((q: any) => q);
    const sendable = await counted((q: any) => q.eq("subscribed", true).eq("bounced", false));
    const unsubscribed = await counted((q: any) => q.eq("subscribed", false));
    const bounced = await counted((q: any) => q.eq("bounced", true));

    const { data: campaigns } = await db
      .from("marketing_campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    const withStats = await Promise.all(
      (campaigns ?? []).map(async (c) => {
        const { count: sent } = await db
          .from("marketing_sends")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", c.id)
          .eq("status", "sent");
        const { count: failed } = await db
          .from("marketing_sends")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", c.id)
          .eq("status", "failed");
        return { ...c, sentCount: sent ?? 0, failedCount: failed ?? 0 };
      }),
    );

    return {
      ok: true as const,
      contacts: { total, sendable, unsubscribed, bounced },
      campaigns: withStats,
    };
  });

const CreateCampaignSchema = z.object({
  accessToken: z.string().min(1),
  name: z.string().min(1).max(120),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(20000),
  contentType: z.enum(["text", "html"]).default("text"),
  ctaLabel: z.string().max(60).optional(),
  ctaUrl: z.string().url().max(500).optional(),
  ramp: z.array(z.number().int().min(1).max(5000)).min(1).max(60),
});

export const createMarketingCampaign = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreateCampaignSchema.parse(input))
  .handler(async ({ data }) => {
    const { requireAdminByToken } = await import("@/server/admin-guard.server");
    const admin = await requireAdminByToken(data.accessToken);
    if (!admin.ok) return { ok: false as const, error: admin.error };

    const { data: row, error } = await admin.supabaseAdmin
      .from("marketing_campaigns")
      .insert({
        name: data.name.trim(),
        subject: data.subject.trim(),
        message: data.message.trim(),
        content_type: data.contentType,
        cta_label: data.ctaLabel?.trim() || null,
        cta_url: data.ctaUrl?.trim() || null,
        ramp: data.ramp,
      })
      .select("id")
      .single();
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, id: row.id };
  });

const StatusSchema = z.object({
  accessToken: z.string().min(1),
  campaignId: z.string().uuid(),
  status: z.enum(["draft", "running", "paused", "completed"]),
});

export const setMarketingCampaignStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => StatusSchema.parse(input))
  .handler(async ({ data }) => {
    const { requireAdminByToken } = await import("@/server/admin-guard.server");
    const admin = await requireAdminByToken(data.accessToken);
    if (!admin.ok) return { ok: false as const, error: admin.error };

    const patch = {
      status: data.status,
      ...(data.status === "running" ? { started_at: new Date().toISOString() } : {}),
      ...(data.status === "completed" ? { completed_at: new Date().toISOString() } : {}),
    };

    const { error } = await admin.supabaseAdmin
      .from("marketing_campaigns")
      .update(patch)
      .eq("id", data.campaignId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

const RunNowSchema = z.object({
  accessToken: z.string().min(1),
  campaignId: z.string().uuid(),
});

// Manual "send today's batch now" button — same capped batch the cron runs.
export const runMarketingCampaignBatchNow = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RunNowSchema.parse(input))
  .handler(async ({ data }) => {
    const { requireAdminByToken } = await import("@/server/admin-guard.server");
    const admin = await requireAdminByToken(data.accessToken);
    if (!admin.ok) return { ok: false as const, error: admin.error };

    const { runCampaignBatch } = await import("@/server/marketing-drip.server");
    const result = await runCampaignBatch(data.campaignId, true);
    if (!result.ok) return { ok: false as const, error: result.reason };
    return { ok: true as const, sent: result.sent, failed: result.failed, completed: result.completed };
  });

const TestSendSchema = z.object({
  accessToken: z.string().min(1),
  campaignId: z.string().uuid(),
  email: z.string().email(),
});

export const sendMarketingCampaignTest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TestSendSchema.parse(input))
  .handler(async ({ data }) => {
    const { requireAdminByToken } = await import("@/server/admin-guard.server");
    const admin = await requireAdminByToken(data.accessToken);
    if (!admin.ok) return { ok: false as const, error: admin.error };

    const { data: c, error } = await admin.supabaseAdmin
      .from("marketing_campaigns")
      .select("subject,message,content_type,cta_label,cta_url")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (error || !c) return { ok: false as const, error: error?.message ?? "Campaign not found" };

    const { data: res, error: sendErr } = await admin.supabaseAdmin.functions.invoke(
      "send-marketing-email",
      {
        body: {
          to: data.email,
          subject: `[TEST] ${c.subject}`,
          message: c.message,
          contentType: c.content_type === "html" ? "html" : "text",
          ctaLabel: c.cta_label,
          ctaUrl: c.cta_url,
          includeOneClickUnsubscribe: true,
        },
      },
    );
    if (sendErr) return { ok: false as const, error: sendErr.message };
    if (res && (res as { ok?: boolean }).ok === false) {
      return { ok: false as const, error: (res as { error?: string }).error ?? "Send failed" };
    }
    return { ok: true as const };
  });
