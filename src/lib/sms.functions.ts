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
