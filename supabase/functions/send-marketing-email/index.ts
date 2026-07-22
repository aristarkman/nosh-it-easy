// Sends a marketing email via Resend. Invoked server-to-server only, via
// supabaseAdmin.functions.invoke() from marketing-email.functions.ts (a
// TanStack server function that already gated the caller as an admin) --
// this is NOT meant to be called directly from browser code, so there's no
// origin/CORS allowlist here the way send-order-confirmation needs one.
import { z } from "https://esm.sh/zod@3.23.8";
import { createHmac } from "node:crypto";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS = "The Kosher Nosh <orders@takeout.koshernosh.com>";
// CAN-SPAM requires a physical postal address in every marketing email.
// Placeholder -- replace with the real mailing address before sending
// anything for real.
const PHYSICAL_ADDRESS = Deno.env.get("BUSINESS_MAILING_ADDRESS") ?? "[Set BUSINESS_MAILING_ADDRESS]";
const UNSUBSCRIBE_SECRET = Deno.env.get("UNSUBSCRIBE_SECRET") ?? "";
const SITE_URL = "https://takeout.koshernosh.com";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function nl2br(s: string): string {
  return esc(s).replace(/\n/g, "<br>");
}

function unsubscribeToken(email: string): string {
  return createHmac("sha256", UNSUBSCRIBE_SECRET).update(email.toLowerCase()).digest("hex").slice(0, 32);
}

function buildHtml(input: { subject: string; message: string; unsubscribeUrl: string | null }): string {
  const unsubLine = input.unsubscribeUrl
    ? `<a href="${esc(input.unsubscribeUrl)}" style="color:#666;">Unsubscribe</a>`
    : `Reply to this email to unsubscribe.`;
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
    <h2 style="margin:0 0 20px;">The Kosher Nosh</h2>
    <div style="font-size:15px;line-height:1.6;">${nl2br(input.message)}</div>
    <hr style="margin:32px 0 16px;border:none;border-top:1px solid #eee;">
    <p style="font-size:11px;color:#999;line-height:1.6;margin:0;">
      ${esc(PHYSICAL_ADDRESS)}<br>
      ${unsubLine}
    </p>
  </div>`;
}

const BodySchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(20000),
  // Only present for the app's own opted-in customer_profiles audience --
  // imported/external contacts don't have a persistent record to flip, so
  // they fall back to a reply-to-unsubscribe instruction instead.
  includeOneClickUnsubscribe: z.boolean().default(false),
});

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  if (!RESEND_API_KEY) return jsonResponse({ ok: false, error: "RESEND_API_KEY is not configured" }, 500);

  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch (err) {
    console.error("send-marketing-email: invalid payload", err);
    return jsonResponse({ ok: false, error: "Invalid request payload" }, 400);
  }

  const unsubscribeUrl =
    parsed.includeOneClickUnsubscribe && UNSUBSCRIBE_SECRET
      ? `${SITE_URL}/api/public/hooks/unsubscribe-email?email=${encodeURIComponent(
          parsed.to,
        )}&token=${unsubscribeToken(parsed.to)}`
      : null;

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
        subject: parsed.subject,
        html: buildHtml({ subject: parsed.subject, message: parsed.message, unsubscribeUrl }),
        text: `${parsed.message}\n\n---\n${PHYSICAL_ADDRESS}\n${
          unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : "Reply to this email to unsubscribe."
        }`,
        ...(unsubscribeUrl ? { headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` } } : {}),
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("Resend error:", res.status, data);
      return jsonResponse({ ok: false, error: `Resend error [${res.status}]` }, 502);
    }
    return jsonResponse({ ok: true, id: data?.id ?? null }, 200);
  } catch (err) {
    console.error("send-marketing-email failed:", err);
    return jsonResponse({ ok: false, error: err instanceof Error ? err.message : "Send failed" }, 500);
  }
});
