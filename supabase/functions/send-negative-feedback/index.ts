// Emails negative post-order feedback straight to the owner. Fire-and-forget
// from the confirmation page — a failure here should never block the UI.
import { z } from "https://esm.sh/zod@3.23.8";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS = "The Kosher Nosh <orders@takeout.koshernosh.com>";
const TO_ADDRESS = "ari@koshernosh.com";

const DEFAULT_ORIGINS = [
  "https://takeout.koshernosh.com",
  "https://koshernosh.com",
  "https://www.koshernosh.com",
  "http://localhost:3000",
  "http://localhost:5173",
];
const ALLOWED_ORIGINS = (Deno.env.get("SEND_NEGATIVE_FEEDBACK_ORIGINS") ?? "")
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

const BodySchema = z.object({
  orderNumber: z.string().min(1).max(40),
  locationName: z.string().min(1).max(80), // store identifier — required
  customerName: z.string().max(80).optional().nullable(),
  customerEmail: z.string().email().optional().nullable(),
  feedback: z.string().min(1).max(500),
});

type Body = z.infer<typeof BodySchema>;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildHtml(data: Body): string {
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
    <h2 style="margin:0 0 4px;">😕 Negative Order Feedback</h2>
    <p style="margin:0 0 20px;color:#666;">Order #${esc(data.orderNumber)}</p>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
      <tr><td style="padding:4px 0;color:#666;">Store</td><td style="padding:4px 0;text-align:right;font-weight:600;">${esc(
        data.locationName
      )}</td></tr>
      ${
        data.customerName
          ? `<tr><td style="padding:4px 0;color:#666;">Customer</td><td style="padding:4px 0;text-align:right;">${esc(
              data.customerName
            )}</td></tr>`
          : ""
      }
      ${
        data.customerEmail
          ? `<tr><td style="padding:4px 0;color:#666;">Email</td><td style="padding:4px 0;text-align:right;">${esc(
              data.customerEmail
            )}</td></tr>`
          : ""
      }
    </table>

    <div style="border-left:3px solid #b91c1c;padding:8px 0 8px 12px;font-size:14px;line-height:1.5;white-space:pre-wrap;">${esc(
      data.feedback
    )}</div>
  </div>`;
}

function buildText(data: Body): string {
  const lines = [
    `Negative Order Feedback — Order #${data.orderNumber}`,
    `Store: ${data.locationName}`,
  ];
  if (data.customerName) lines.push(`Customer: ${data.customerName}`);
  if (data.customerEmail) lines.push(`Email: ${data.customerEmail}`);
  lines.push("", data.feedback);
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
    console.error("send-negative-feedback: invalid payload", err);
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
        to: [TO_ADDRESS],
        subject: `😕 Negative feedback — ${parsed.locationName} — Order #${parsed.orderNumber}`,
        html: buildHtml(parsed),
        text: buildText(parsed),
        reply_to: parsed.customerEmail || undefined,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("Resend error:", res.status, data);
      return jsonResponse({ ok: false, error: `Resend error [${res.status}]` }, 502, req);
    }

    return jsonResponse({ ok: true, id: data?.id ?? null }, 200, req);
  } catch (err) {
    console.error("send-negative-feedback failed:", err);
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : "Send failed" },
      500,
      req
    );
  }
});
