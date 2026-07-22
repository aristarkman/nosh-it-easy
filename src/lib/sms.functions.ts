import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

export const sendOrderStatusSms = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ data }) => {
    const to = normalizePhone(data.to);
    if (!to) return { ok: false, error: "Invalid phone number" };
    try {
      const result = await sendSms(to, buildMessage(data));
      return { ok: true, sid: result.sid as string };
    } catch (err) {
      console.error("sendOrderStatusSms failed:", err);
      return { ok: false, error: err instanceof Error ? err.message : "Send failed" };
    }
  });

const OptInSchema = z.object({
  to: z.string().min(7).max(20),
});

// Fires once, immediately after a customer opts in to order-status texts —
// distinct from the order-status texts themselves. This is what campaign
// registration forms mean by "opt-in message": the confirmation sent right
// after consent is captured, not the first transactional message.
export const sendSmsOptInConfirmation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => OptInSchema.parse(input))
  .handler(async ({ data }) => {
    const to = normalizePhone(data.to);
    if (!to) return { ok: false, error: "Invalid phone number" };
    const body =
      "The Kosher Nosh: You're subscribed to order status texts. Msg frequency varies. Msg & data rates may apply. Reply STOP to unsubscribe, HELP for help.";
    try {
      const result = await sendSms(to, body);
      return { ok: true, sid: result.sid as string };
    } catch (err) {
      console.error("sendSmsOptInConfirmation failed:", err);
      return { ok: false, error: err instanceof Error ? err.message : "Send failed" };
    }
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
    const { count, error } = await admin.supabaseAdmin
      .from("customer_profiles")
      .select("user_id", { count: "exact", head: true })
      .eq("marketing_sms", true)
      .not("phone", "is", null);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, count: count ?? 0 };
  });

const MAX_BLAST_RECIPIENTS = 2000;
const BLAST_CONCURRENCY = 5;

const BlastSchema = z.object({
  accessToken: z.string().min(1),
  message: z.string().min(1).max(300),
});

export const sendMarketingSmsBlast = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => BlastSchema.parse(input))
  .handler(async ({ data }) => {
    const admin = await requireAdmin(data.accessToken);
    if (!admin.ok) return { ok: false as const, error: admin.error };

    let body = data.message.trim();
    if (!/reply stop/i.test(body)) body += " Reply STOP to opt out.";
    if (!/^the kosher nosh/i.test(body)) body = `The Kosher Nosh: ${body}`;

    const { data: rows, error } = await admin.supabaseAdmin
      .from("customer_profiles")
      .select("user_id,phone,full_name")
      .eq("marketing_sms", true)
      .not("phone", "is", null)
      .limit(MAX_BLAST_RECIPIENTS);
    if (error) return { ok: false as const, error: error.message };

    const recipients = (rows ?? []).filter(
      (r): r is { user_id: string; phone: string; full_name: string | null } => !!r.phone,
    );
    let sent = 0;
    let failed = 0;
    const failures: string[] = [];

    for (let i = 0; i < recipients.length; i += BLAST_CONCURRENCY) {
      const batch = recipients.slice(i, i + BLAST_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (r) => {
          const to = normalizePhone(r.phone);
          if (!to) return { ok: false, phone: r.phone };
          try {
            await sendSms(to, body);
            return { ok: true };
          } catch (err) {
            console.error("marketing blast SMS failed:", r.phone, err);
            return { ok: false, phone: r.phone };
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
