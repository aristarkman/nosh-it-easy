import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";
const FROM_NUMBER = "+16097401249";

async function sendSms(to: string, body: string) {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  const TWILIO_API_KEY = process.env.TWILIO_API_KEY;
  if (!TWILIO_API_KEY) throw new Error("TWILIO_API_KEY is not configured");

  const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TWILIO_API_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: FROM_NUMBER, Body: body }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Twilio error [${res.status}]: ${JSON.stringify(data)}`);
  }
  return data;
}

function normalizePhone(raw: string): string | null {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (raw.trim().startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

const Schema = z.object({
  to: z.string().min(7).max(20),
  status: z.enum(["received", "accepted", "ready", "out_for_delivery", "completed"]),
  orderNumber: z.string().min(1).max(40),
  customerName: z.string().min(1).max(80).optional(),
  orderType: z.enum(["pickup", "delivery"]).optional(),
  locationName: z.string().max(80).optional(),
});

function buildMessage(input: z.infer<typeof Schema>): string {
  const name = input.customerName ? `, ${input.customerName.split(" ")[0]}` : "";
  const where = input.locationName ? ` at ${input.locationName}` : "";
  switch (input.status) {
    case "received":
      return `The Kosher Nosh: Thanks${name}! We received your order #${input.orderNumber}${where}. We'll text you when it's ready. Reply STOP to opt out.`;
    case "accepted":
      return `The Kosher Nosh: Order #${input.orderNumber} is being prepared${where}. Reply STOP to opt out.`;
    case "ready":
      return input.orderType === "delivery"
        ? `The Kosher Nosh: Order #${input.orderNumber} is ready and waiting for a driver. Reply STOP to opt out.`
        : `The Kosher Nosh: Order #${input.orderNumber} is ready for pickup${where}! Reply STOP to opt out.`;
    case "out_for_delivery":
      return `The Kosher Nosh: Order #${input.orderNumber} is on the way! Reply STOP to opt out.`;
    case "completed":
      return `The Kosher Nosh: Order #${input.orderNumber} is complete. Thanks${name}! Reply STOP to opt out.`;
  }
}

const RefundSchema = z.object({
  to: z.string().min(7).max(20),
  orderNumber: z.string().min(1).max(40),
  amount: z.number().nonnegative(),
  customerName: z.string().min(1).max(80).optional(),
  isVoid: z.boolean().optional(),
});

export const sendRefundIssuedSms = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RefundSchema.parse(input))
  .handler(async ({ data }) => {
    const to = normalizePhone(data.to);
    if (!to) return { ok: false, error: "Invalid phone number" };
    const name = data.customerName ? `, ${data.customerName.split(" ")[0]}` : "";
    const amt = `$${data.amount.toFixed(2)}`;
    const body = data.isVoid
      ? `The Kosher Nosh: Order #${data.orderNumber} was voided${name}. The ${amt} hold will drop off your card within 1-3 days. Reply STOP to opt out.`
      : `The Kosher Nosh: A refund of ${amt} has been issued for order #${data.orderNumber}${name}. It will appear on your card in 3-5 business days. Reply STOP to opt out.`;
    try {
      const result = await sendSms(to, body);
      return { ok: true, sid: result.sid as string };
    } catch (err) {
      console.error("sendRefundIssuedSms failed:", err);
      return { ok: false, error: err instanceof Error ? err.message : "Send failed" };
    }
  });

const OPT_IN_CONFIRMATION_BODY =
  "The Kosher Nosh: You're signed up for order status texts (order received, ready for pickup, out for delivery). Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out.";

// Sends the one-time opt-in confirmation SMS the first time we ever text a
// given phone number an order status update, then records it so it never
// sends again for that number. Only fires for numbers with consent — since
// sendOrderStatusSms is only ever called by callers who already gated on the
// order's own SMS consent checkbox, a first-seen number here is treated as
// consented; a number explicitly marked sms_consent = false is skipped.
async function ensureOptInConfirmation(to: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: existing, error: selectError } = await supabaseAdmin
    .from("sms_subscribers")
    .select("sms_consent, confirmation_sent_at")
    .eq("phone", to)
    .maybeSingle();
  if (selectError) {
    console.error("sms_subscribers lookup failed:", selectError);
    return;
  }

  if (!existing) {
    const { error: insertError } = await supabaseAdmin
      .from("sms_subscribers")
      .insert({ phone: to, sms_consent: true, source: "order" });
    if (insertError) {
      console.error("sms_subscribers insert failed:", insertError);
      return;
    }
  } else {
    if (!existing.sms_consent) return;
    if (existing.confirmation_sent_at) return;
  }

  try {
    await sendSms(to, OPT_IN_CONFIRMATION_BODY);
  } catch (err) {
    console.error("Opt-in confirmation SMS failed:", err);
    return; // confirmation_sent_at stays null, so we retry on the next order status send
  }

  const { error: updateError } = await supabaseAdmin
    .from("sms_subscribers")
    .update({ confirmation_sent_at: new Date().toISOString() })
    .eq("phone", to);
  if (updateError) console.error("sms_subscribers confirmation update failed:", updateError);
}

export const sendOrderStatusSms = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ data }) => {
    const to = normalizePhone(data.to);
    if (!to) return { ok: false, error: "Invalid phone number" };
    try {
      await ensureOptInConfirmation(to);
      const result = await sendSms(to, buildMessage(data));
      return { ok: true, sid: result.sid as string };
    } catch (err) {
      console.error("sendOrderStatusSms failed:", err);
      return { ok: false, error: err instanceof Error ? err.message : "Send failed" };
    }
  });

const SubscribeSchema = z.object({
  phone: z.string().min(7).max(20),
  transactionalConsent: z.boolean().default(false),
  marketingConsent: z.boolean().default(false),
  source: z.string().max(40).default("sms_opt_in_page"),
});

// Shared by all three consent surfaces (/sms-opt-in, checkout, signup) for
// phone-only persistence. Each checkbox is independent — checking one
// doesn't imply the other. Sends no SMS itself; the one-time transactional
// confirmation text fires lazily off the first order-status SMS (see
// ensureOptInConfirmation above). There's no marketing confirmation text —
// Twilio only requires the one-time opt-in confirmation for the message
// category actually being sent automatically (order status); marketing
// blasts are manually triggered by an admin and carry their own STOP/HELP
// language per message (see sendMarketingSmsBlast below).
export const subscribeToSmsUpdates = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SubscribeSchema.parse(input))
  .handler(async ({ data }) => {
    const to = normalizePhone(data.phone);
    if (!to) return { ok: false as const, error: "Invalid phone number" };
    if (!data.transactionalConsent && !data.marketingConsent) {
      return { ok: false as const, error: "Check at least one consent box" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { data: existing } = await supabaseAdmin
      .from("sms_subscribers")
      .select("sms_consent, marketing_sms_consent")
      .eq("phone", to)
      .maybeSingle();

    const patch: Database["public"]["Tables"]["sms_subscribers"]["Insert"] = {
      phone: to,
      source: data.source,
      updated_at: now,
    };
    if (data.transactionalConsent) patch.sms_consent = true;
    if (data.marketingConsent) {
      patch.marketing_sms_consent = true;
      if (!existing?.marketing_sms_consent) patch.marketing_sms_consent_at = now;
    }

    const { error } = await supabaseAdmin
      .from("sms_subscribers")
      .upsert(patch, { onConflict: "phone" });
    if (error) {
      console.error("subscribeToSmsUpdates failed:", error);
      return { ok: false as const, error: "Could not save your opt-in. Please try again." };
    }
    return { ok: true as const };
  });

const STAFF_ALERT_NUMBERS = ["+19173352812"];

const StaffAlertSchema = z.object({
  orderNumber: z.string().min(1).max(40),
  customerName: z.string().min(1).max(80),
  orderType: z.enum(["pickup", "delivery"]),
  locationName: z.string().max(80).optional(),
  total: z.number().nonnegative(),
  whenType: z.string().max(20).optional(),
  scheduledTime: z.string().max(40).nullable().optional(),
  itemCount: z.number().int().nonnegative(),
});

export const sendStaffNewOrderAlert = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => StaffAlertSchema.parse(input))
  .handler(async ({ data }) => {
    const when =
      data.whenType === "schedule" && data.scheduledTime
        ? `Scheduled ${data.scheduledTime}`
        : "ASAP";
    const where = data.locationName ? ` @ ${data.locationName}` : "";
    const body = `New ${data.orderType.toUpperCase()} order #${data.orderNumber}${where}\n${data.customerName} • ${data.itemCount} item(s) • $${data.total.toFixed(2)}\n${when}`;
    const results: Array<{ to: string; ok: boolean; error?: string }> = [];
    for (const raw of STAFF_ALERT_NUMBERS) {
      const to = normalizePhone(raw);
      if (!to) {
        results.push({ to: raw, ok: false, error: "Invalid number" });
        continue;
      }
      try {
        await sendSms(to, body);
        results.push({ to, ok: true });
      } catch (err) {
        console.error("staff alert SMS failed:", err);
        results.push({ to, ok: false, error: err instanceof Error ? err.message : "fail" });
      }
    }
    return { results };
  });

const OwnerAlertSchema = z.object({
  kind: z.string().min(1).max(40),
  message: z.string().min(1).max(280),
  orderNumber: z.string().max(40).optional(),
  locationName: z.string().max(80).optional(),
});

const OWNER_ALERT_NUMBERS = ["+19173352812"];

export const sendOwnerErrorAlert = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => OwnerAlertSchema.parse(input))
  .handler(async ({ data }) => {
    const where = data.locationName ? ` @ ${data.locationName}` : "";
    const ord = data.orderNumber ? ` #${data.orderNumber}` : "";
    const body = `⚠️ Kosher Nosh ${data.kind.toUpperCase()}${ord}${where}\n${data.message}`;
    const results: Array<{ to: string; ok: boolean; error?: string }> = [];
    for (const raw of OWNER_ALERT_NUMBERS) {
      const to = normalizePhone(raw);
      if (!to) continue;
      try {
        await sendSms(to, body);
        results.push({ to, ok: true });
      } catch (err) {
        console.error("owner alert SMS failed:", err);
        results.push({ to, ok: false, error: err instanceof Error ? err.message : "fail" });
      }
    }
    return { results };
  });

// ---------------------------------------------------------------------
// Marketing SMS blast (deals & specials) — admin-only, sent only to
// customer_profiles rows with marketing_sms = true. Separate consent scope
// from order-status texts; see account.tsx's "Text me deals, specials &
// cart reminders" toggle.
// ---------------------------------------------------------------------

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

const AudienceSchema = z.object({ accessToken: z.string().min(1) });

export const getMarketingSmsAudienceCount = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AudienceSchema.parse(input))
  .handler(async ({ data }) => {
    const admin = await requireAdmin(data.accessToken);
    if (!admin.ok) return { ok: false as const, error: admin.error };
    const phones = await marketingAudiencePhones(admin.supabaseAdmin);
    return { ok: true as const, count: phones.size };
  });

const MAX_BLAST_RECIPIENTS = 2000;
const BLAST_CONCURRENCY = 5;

const BlastSchema = z.object({
  accessToken: z.string().min(1),
  message: z.string().min(1).max(300),
});

// Union of consented phone numbers from both consent surfaces: logged-in
// accounts (customer_profiles.marketing_sms) and phone-only opt-ins from
// checkout/signup/the standalone opt-in page (sms_subscribers
// .marketing_sms_consent). Deduped by normalized phone so a customer who
// opted in both ways only gets one text.
async function marketingAudiencePhones(
  admin: typeof import("@/integrations/supabase/client.server").supabaseAdmin,
): Promise<Set<string>> {
  const [{ data: accountRows }, { data: guestRows }] = await Promise.all([
    admin
      .from("customer_profiles")
      .select("phone")
      .eq("marketing_sms", true)
      .not("phone", "is", null),
    admin
      .from("sms_subscribers")
      .select("phone")
      .eq("marketing_sms_consent", true),
  ]);
  const phones = new Set<string>();
  for (const r of accountRows ?? []) {
    const n = normalizePhone(r.phone ?? "");
    if (n) phones.add(n);
  }
  for (const r of guestRows ?? []) {
    const n = normalizePhone(r.phone);
    if (n) phones.add(n);
  }
  return phones;
}

export const sendMarketingSmsBlast = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => BlastSchema.parse(input))
  .handler(async ({ data }) => {
    const admin = await requireAdmin(data.accessToken);
    if (!admin.ok) return { ok: false as const, error: admin.error };

    let body = data.message.trim();
    if (!/reply stop/i.test(body)) body += " Reply STOP to opt out.";
    if (!/^the kosher nosh/i.test(body)) body = `The Kosher Nosh: ${body}`;

    const phones = await marketingAudiencePhones(admin.supabaseAdmin);
    const recipients = Array.from(phones).slice(0, MAX_BLAST_RECIPIENTS);
    let sent = 0;
    let failed = 0;
    const failures: string[] = [];

    for (let i = 0; i < recipients.length; i += BLAST_CONCURRENCY) {
      const batch = recipients.slice(i, i + BLAST_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (to) => {
          try {
            await sendSms(to, body);
            return { ok: true };
          } catch (err) {
            console.error("marketing blast SMS failed:", to, err);
            return { ok: false, phone: to };
          }
        }),
      );
      for (const r of results) {
        if (r.ok) sent++;
        else {
          failed++;
          if (r.phone) failures.push(r.phone);
        }
      }
    }

    return {
      ok: true as const,
      audience: recipients.length,
      sent,
      failed,
      truncated: recipients.length >= MAX_BLAST_RECIPIENTS,
    };
  });
