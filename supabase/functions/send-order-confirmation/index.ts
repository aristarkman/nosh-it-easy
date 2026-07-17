// Sends an order confirmation email to the customer via Resend, right after
// an order is placed at checkout. Fire-and-forget from the client — a failure
// here should never block or roll back the order itself.
import { z } from "https://esm.sh/zod@3.23.8";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS = "The Kosher Nosh <orders@takeout.koshernosh.com>";

const DEFAULT_ORIGINS = [
  "https://takeout.koshernosh.com",
  "https://koshernosh.com",
  "https://www.koshernosh.com",
  "http://localhost:3000",
  "http://localhost:5173",
];
const ALLOWED_ORIGINS = (Deno.env.get("SEND_ORDER_CONFIRMATION_ORIGINS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const originAllowlist = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_ORIGINS;

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = originAllowlist.includes(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : originAllowlist[0],
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(body: unknown, status: number, req: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(req),
    },
  });
}

const ItemSchema = z.object({
  name: z.string().min(1).max(200),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
});

const BodySchema = z.object({
  to: z.string().email(),
  orderNumber: z.string().min(1).max(40),
  customerName: z.string().min(1).max(80),
  locationName: z.enum(["Glen Rock", "Cresskill"]),
  orderType: z.enum(["pickup", "delivery"]),
  deliveryAddress: z.string().max(300).nullable().optional(),
  whenType: z.enum(["asap", "schedule"]),
  scheduledTime: z.string().max(40).nullable().optional(),
  items: z.array(ItemSchema).min(1),
  subtotal: z.number().nonnegative(),
  deliveryFee: z.number().nonnegative().nullable().optional(),
  tax: z.number().nonnegative(),
  tip: z.number().nonnegative().nullable().optional(),
  total: z.number().nonnegative(),
});

type Body = z.infer<typeof BodySchema>;

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatScheduledTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    });
  } catch {
    return iso;
  }
}

function buildHtml(data: Body): string {
  const whenLine =
    data.whenType === "schedule" && data.scheduledTime
      ? esc(formatScheduledTime(data.scheduledTime))
      : "ASAP";

  const itemRows = data.items
    .map(
      (item) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;">${esc(item.name)} &times; ${item.quantity}</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">${money(
            item.unitPrice * item.quantity
          )}</td>
        </tr>`
    )
    .join("");

  const deliveryFeeRow =
    data.orderType === "delivery" && data.deliveryFee
      ? `<tr><td style="padding:4px 0;">Delivery Fee</td><td style="padding:4px 0;text-align:right;">${money(
          data.deliveryFee
        )}</td></tr>`
      : "";

  const tipRow = data.tip
    ? `<tr><td style="padding:4px 0;">Tip</td><td style="padding:4px 0;text-align:right;">${money(
        data.tip
      )}</td></tr>`
    : "";

  const deliveryAddressRow =
    data.orderType === "delivery" && data.deliveryAddress
      ? `<tr><td style="padding:4px 0;color:#666;">Delivery Address</td><td style="padding:4px 0;text-align:right;">${esc(
          data.deliveryAddress
        )}</td></tr>`
      : "";

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
    <h2 style="margin:0 0 4px;">Order Confirmed</h2>
    <p style="margin:0 0 20px;color:#666;">Order #${esc(data.orderNumber)}</p>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
      <tr><td style="padding:4px 0;color:#666;">Customer</td><td style="padding:4px 0;text-align:right;">${esc(
        data.customerName
      )}</td></tr>
      <tr><td style="padding:4px 0;color:#666;">Location</td><td style="padding:4px 0;text-align:right;">${esc(
        data.locationName
      )}</td></tr>
      <tr><td style="padding:4px 0;color:#666;">Order Type</td><td style="padding:4px 0;text-align:right;text-transform:capitalize;">${esc(
        data.orderType
      )}</td></tr>
      ${deliveryAddressRow}
      <tr><td style="padding:4px 0;color:#666;">Scheduled Time</td><td style="padding:4px 0;text-align:right;">${whenLine}</td></tr>
    </table>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:12px;">
      ${itemRows}
    </table>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
      <tr><td style="padding:4px 0;">Subtotal</td><td style="padding:4px 0;text-align:right;">${money(
        data.subtotal
      )}</td></tr>
      ${deliveryFeeRow}
      <tr><td style="padding:4px 0;">Tax</td><td style="padding:4px 0;text-align:right;">${money(
        data.tax
      )}</td></tr>
      ${tipRow}
      <tr>
        <td style="padding:8px 0 0;border-top:2px solid #1a1a1a;font-weight:600;">Total</td>
        <td style="padding:8px 0 0;border-top:2px solid #1a1a1a;text-align:right;font-weight:600;">${money(
          data.total
        )}</td>
      </tr>
    </table>

    <p style="font-size:14px;color:#444;line-height:1.5;">
      Thank you for your order! If you have any questions call us at (201) 445-1186 for Glen Rock or (201) 331-0000 for Cresskill.
    </p>
  </div>`;
}

function buildText(data: Body): string {
  const whenLine =
    data.whenType === "schedule" && data.scheduledTime
      ? formatScheduledTime(data.scheduledTime)
      : "ASAP";

  const lines = [
    `Order Confirmed — The Kosher Nosh #${data.orderNumber}`,
    "",
    `Customer: ${data.customerName}`,
    `Location: ${data.locationName}`,
    `Order Type: ${data.orderType}`,
  ];
  if (data.orderType === "delivery" && data.deliveryAddress) {
    lines.push(`Delivery Address: ${data.deliveryAddress}`);
  }
  lines.push(`Scheduled Time: ${whenLine}`, "", "Items:");
  for (const item of data.items) {
    lines.push(`  ${item.name} x${item.quantity} - ${money(item.unitPrice * item.quantity)}`);
  }
  lines.push("", `Subtotal: ${money(data.subtotal)}`);
  if (data.orderType === "delivery" && data.deliveryFee) {
    lines.push(`Delivery Fee: ${money(data.deliveryFee)}`);
  }
  lines.push(`Tax: ${money(data.tax)}`);
  if (data.tip) lines.push(`Tip: ${money(data.tip)}`);
  lines.push(`Total: ${money(data.total)}`, "");
  lines.push(
    "Thank you for your order! If you have any questions call us at (201) 445-1186 for Glen Rock or (201) 331-0000 for Cresskill."
  );
  return lines.join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405, req);
  }
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not configured");
    return jsonResponse({ ok: false, error: "Email service not configured" }, 500, req);
  }

  let parsed: Body;
  try {
    const raw = await req.json();
    parsed = BodySchema.parse(raw);
  } catch (err) {
    console.error("send-order-confirmation: invalid payload", err);
    return jsonResponse({ ok: false, error: "Invalid request payload" }, 400, req);
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [parsed.to],
        subject: `Order Confirmed — The Kosher Nosh #${parsed.orderNumber}`,
        html: buildHtml(parsed),
        text: buildText(parsed),
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("Resend error:", res.status, data);
      return jsonResponse({ ok: false, error: `Resend error [${res.status}]` }, 502, req);
    }

    return jsonResponse({ ok: true, id: data?.id ?? null }, 200, req);
  } catch (err) {
    console.error("send-order-confirmation failed:", err);
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Send failed" },
      500,
      req
    );
  }
});
