// Drip sender for stored marketing contacts.
//
// Deliverability rationale: sending 3,000 marketing emails at once from a
// domain that has only ever sent order confirmations is the fastest way to
// get spam-foldered or blacklisted. Each campaign therefore carries a
// per-day "ramp" (e.g. 50, 100, 200, 400 ...) and this runner sends at most
// one batch per calendar day, best customers first (most recent order date),
// skipping anyone unsubscribed, bounced, or already sent this campaign.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BATCH_CONCURRENCY = 4;
const BATCH_PAUSE_MS = 1200;

type Campaign = {
  id: string;
  subject: string;
  message: string;
  content_type: string;
  cta_label: string | null;
  cta_url: string | null;
  ramp: number[];
  day_index: number;
  status: string;
  last_run_on: string | null;
};

type Contact = { id: string; email: string };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function dailyCap(campaign: Pick<Campaign, "ramp" | "day_index">): number {
  const ramp = campaign.ramp?.length ? campaign.ramp : [50];
  return ramp[Math.min(campaign.day_index, ramp.length - 1)] ?? ramp[ramp.length - 1];
}

async function sendOne(campaign: Campaign, to: string) {
  const { data, error } = await supabaseAdmin.functions.invoke("send-marketing-email", {
    body: {
      to,
      subject: campaign.subject,
      message: campaign.message,
      contentType: campaign.content_type === "html" ? "html" : "text",
      ctaLabel: campaign.cta_label,
      ctaUrl: campaign.cta_url,
      includeOneClickUnsubscribe: true,
    },
  });
  if (error) throw error;
  if (data && (data as { ok?: boolean }).ok === false) {
    throw new Error((data as { error?: string }).error ?? "Send failed");
  }
}

async function pickRecipients(campaign: Campaign, cap: number): Promise<Contact[]> {
  const { data: alreadySent } = await supabaseAdmin
    .from("marketing_sends")
    .select("email")
    .eq("campaign_id", campaign.id);
  const sentSet = new Set((alreadySent ?? []).map((r) => r.email.toLowerCase()));

  const picked: Contact[] = [];
  const pageSize = 500;
  for (let from = 0; picked.length < cap; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("marketing_contacts")
      .select("id,email")
      .eq("subscribed", true)
      .eq("bounced", false)
      .order("last_order_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const c of data) {
      if (sentSet.has(c.email.toLowerCase())) continue;
      picked.push(c);
      if (picked.length >= cap) break;
    }
    if (data.length < pageSize) break;
  }
  return picked;
}

/** Runs today's batch for one campaign. Safe to call twice — it no-ops if
 *  a batch already ran today. */
export async function runCampaignBatch(campaignId: string, force = false) {
  const { data: campaign, error } = await supabaseAdmin
    .from("marketing_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw error;
  if (!campaign) return { ok: false as const, reason: "not_found" };
  const c = campaign as unknown as Campaign;
  if (c.status !== "running") return { ok: false as const, reason: "not_running" };
  if (!force && c.last_run_on === todayIso()) {
    return { ok: false as const, reason: "already_ran_today" };
  }

  const cap = dailyCap(c);
  const recipients = await pickRecipients(c, cap);

  if (recipients.length === 0) {
    await supabaseAdmin
      .from("marketing_campaigns")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", c.id);
    return { ok: true as const, sent: 0, failed: 0, completed: true };
  }

  let sent = 0;
  let failed = 0;
  for (let i = 0; i < recipients.length; i += BATCH_CONCURRENCY) {
    const slice = recipients.slice(i, i + BATCH_CONCURRENCY);
    const results = await Promise.all(
      slice.map(async (r) => {
        try {
          await sendOne(c, r.email);
          return { r, ok: true as const, error: null };
        } catch (e) {
          console.error("marketing drip send failed:", r.email, e);
          return { r, ok: false as const, error: e instanceof Error ? e.message : String(e) };
        }
      }),
    );

    const rows = results.map((x) => ({
      campaign_id: c.id,
      contact_id: x.r.id,
      email: x.r.email,
      status: x.ok ? "sent" : "failed",
      error: x.error,
    }));
    await supabaseAdmin.from("marketing_sends").upsert(rows, { onConflict: "campaign_id,email" });

    const okIds = results.filter((x) => x.ok).map((x) => x.r.id);
    if (okIds.length) {
      await supabaseAdmin
        .from("marketing_contacts")
        .update({ last_emailed_at: new Date().toISOString() })
        .in("id", okIds);
    }

    sent += okIds.length;
    failed += results.length - okIds.length;
    if (i + BATCH_CONCURRENCY < recipients.length) {
      await new Promise((res) => setTimeout(res, BATCH_PAUSE_MS));
    }
  }

  const nextDay = c.day_index + 1;
  const finished = recipients.length < cap;
  await supabaseAdmin
    .from("marketing_campaigns")
    .update({
      day_index: nextDay,
      last_run_on: todayIso(),
      status: finished ? "completed" : "running",
      completed_at: finished ? new Date().toISOString() : null,
    })
    .eq("id", c.id);

  return { ok: true as const, sent, failed, completed: finished };
}

/** Called daily by cron: runs today's batch for every running campaign. */
export async function runAllDueCampaigns() {
  const { data: campaigns, error } = await supabaseAdmin
    .from("marketing_campaigns")
    .select("id,last_run_on")
    .eq("status", "running");
  if (error) throw error;

  const results: Array<{ id: string; sent?: number; failed?: number; reason?: string }> = [];
  for (const row of campaigns ?? []) {
    if (row.last_run_on === todayIso()) {
      results.push({ id: row.id, reason: "already_ran_today" });
      continue;
    }
    try {
      const r = await runCampaignBatch(row.id);
      results.push({ id: row.id, ...("sent" in r ? r : { reason: r.reason }) });
    } catch (e) {
      console.error("drip campaign failed:", row.id, e);
      results.push({ id: row.id, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
