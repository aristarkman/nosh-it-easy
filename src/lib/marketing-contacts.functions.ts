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
    // PostgREST caps a plain select at 1000 rows, so page through the list --
    // otherwise big lists re-insert known contacts and hit the unique index.
    const existingSet = new Set<string>();
    const page = 1000;
    for (let from = 0; ; from += page) {
      const { data: existing, error } = await db
        .from("marketing_contacts")
        .select("email")
        .order("email", { ascending: true })
        .range(from, from + page - 1);
      if (error) return { ok: false as const, error: error.message };
      for (const r of existing ?? []) if (r.email) existingSet.add(r.email.toLowerCase());
      if (!existing || existing.length < page) break;
    }
    const fresh = rows.filter((r) => !existingSet.has(String(r.email)));
    const alreadyStored = rows.length - fresh.length;

    // The unique index is on lower(email), an expression index PostgREST can't
    // target with ON CONFLICT -- so insert normally and, if a chunk trips the
    // index, retry that chunk row by row and skip only the conflicting rows.
    let inserted = 0;
    let skippedConflicts = 0;
    for (let i = 0; i < fresh.length; i += 500) {
      const chunk = fresh.slice(i, i + 500);
      const { error } = await db.from("marketing_contacts").insert(chunk as never);
      if (!error) {
        inserted += chunk.length;
        continue;
      }
      if (error.code !== "23505") return { ok: false as const, error: error.message };
      for (const row of chunk) {
        const { error: rowErr } = await db.from("marketing_contacts").insert(row as never);
        if (!rowErr) inserted++;
        else if (rowErr.code === "23505") skippedConflicts++;
        else return { ok: false as const, error: rowErr.message };
      }
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

    const smsAudience = await counted((q: any) =>
      q.eq("subscribed", true).eq("sms_subscribed", true).not("phone", "is", null),
    );

    return {
      ok: true as const,
      contacts: { total, sendable, unsubscribed, bounced, smsAudience },
      campaigns: withStats,
    };
  });

const CreateCampaignSchema = z.object({
  accessToken: z.string().min(1),
  channel: z.enum(["email", "sms"]).default("email"),
  name: z.string().min(1).max(120),
  subject: z.string().max(200).optional(),
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
        channel: data.channel,
        name: data.name.trim(),
        // SMS campaigns have no subject line; keep the internal name there.
        subject: (data.subject?.trim() || data.name).slice(0, 200),
        message: data.message.trim(),
        content_type: data.channel === "sms" ? "text" : data.contentType,
        cta_label: data.channel === "sms" ? null : data.ctaLabel?.trim() || null,
        cta_url: data.channel === "sms" ? null : data.ctaUrl?.trim() || null,
        ramp: data.ramp,
      })

      .select("id")
      .single();
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, id: row.id };
  });

const UpdateCampaignSchema = z.object({
  accessToken: z.string().min(1),
  campaignId: z.string().uuid(),
  name: z.string().min(1).max(120),
  subject: z.string().max(200).optional(),
  message: z.string().min(1).max(20000),
  contentType: z.enum(["text", "html"]).default("text"),
  ctaLabel: z.string().max(60).optional(),
  ctaUrl: z.string().url().max(500).optional(),
});

// Editing is only allowed for draft/paused campaigns — once a campaign is
// running or completed, some recipients have already gotten the old
// content, so changing it now would make the messages inconsistent across
// the audience.
export const updateMarketingCampaign = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdateCampaignSchema.parse(input))
  .handler(async ({ data }) => {
    const { requireAdminByToken } = await import("@/server/admin-guard.server");
    const admin = await requireAdminByToken(data.accessToken);
    if (!admin.ok) return { ok: false as const, error: admin.error };

    const { data: existing, error: fetchError } = await admin.supabaseAdmin
      .from("marketing_campaigns")
      .select("id,channel,status")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (fetchError || !existing) {
      return { ok: false as const, error: fetchError?.message ?? "Campaign not found" };
    }
    if (existing.status !== "draft" && existing.status !== "paused") {
      return {
        ok: false as const,
        error: `Can't edit a campaign that's ${existing.status}. Pause it first.`,
      };
    }
    const isSms = existing.channel === "sms";

    const { error } = await admin.supabaseAdmin
      .from("marketing_campaigns")
      .update({
        name: data.name.trim(),
        subject: (isSms ? data.name : data.subject?.trim() || data.name).slice(0, 200),
        message: data.message.trim(),
        content_type: isSms ? "text" : data.contentType,
        cta_label: isSms ? null : data.ctaLabel?.trim() || null,
        cta_url: isSms ? null : data.ctaUrl?.trim() || null,
      })
      .eq("id", data.campaignId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
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
  // Email address for email campaigns, phone number for SMS campaigns.
  to: z.string().min(3).max(200),
});

export const sendMarketingCampaignTest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TestSendSchema.parse(input))
  .handler(async ({ data }) => {
    const { requireAdminByToken } = await import("@/server/admin-guard.server");
    const admin = await requireAdminByToken(data.accessToken);
    if (!admin.ok) return { ok: false as const, error: admin.error };

    const { data: c, error } = await admin.supabaseAdmin
      .from("marketing_campaigns")
      .select("*")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (error || !c) return { ok: false as const, error: error?.message ?? "Campaign not found" };

    const drip = await import("@/server/marketing-drip.server");
    try {
      if ((c as { channel?: string }).channel === "sms") {
        await drip.sendCampaignSms(c as never, data.to, true);
      } else {
        await drip.sendCampaignEmail(c as never, data.to, true);
      }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
    return { ok: true as const };

  });
