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
// Approximates the app's actual brand red (oklch(0.62 0.225 27) in
// src/styles.css) -- oklch doesn't render reliably across email clients,
// so this is a manually-picked hex fallback. Adjust to the exact brand hex
// if you have one on hand.
const BRAND_COLOR = "#D6472E";

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

function buildHtml(input: {
  message: string;
  contentType: "text" | "html";
  ctaLabel: string | null;
  ctaUrl: string | null;
  unsubscribeUrl: string | null;
}): string {
  // "html" mode trusts the composed content as-is (admin-authored, not
  // public input -- the same trust level as any other admin tool in this
  // app). "text" mode escapes and line-breaks it automatically.
  const body = input.contentType === "html" ? input.message : nl2br(input.message);

  const cta =
    input.ctaLabel && input.ctaUrl
      ? `
    <table role="presentation" style="margin:28px 0 4px;">
      <tr><td style="border-radius:999px;background:${BRAND_COLOR};">
        <a href="${esc(input.ctaUrl)}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">
          ${esc(input.ctaLabel)}
        </a>
      </td></tr>
    </table>`
      : "";

  const unsubLine = input.unsubscribeUrl
    ? `<a href="${esc(input.unsubscribeUrl)}" style="color:#999;text-decoration:underline;">Unsubscribe</a>`
    : `Reply to this email to unsubscribe.`;

  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;">
    <table role="presentation" width="100%" style="background:#f4f4f5;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <tr><td style="background:${BRAND_COLOR};padding:28px 32px;">
            <span style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:0.02em;">The Kosher Nosh</span>
          </td></tr>
          <tr><td style="padding:32px;">
            <div style="font-size:15px;line-height:1.65;color:#1a1a1a;">${body}</div>
            ${cta}
          </td></tr>
          <tr><td style="padding:20px 32px;background:#fafafa;border-top:1px solid #eee;">
            <p style="font-size:11px;color:#999;line-height:1.6;margin:0;">
              ${esc(PHYSICAL_ADDRESS)}<br>
              ${unsubLine}
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BodySchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(20000),
  contentType: z.enum(["text", "html"]).default("text"),
  ctaLabel: z.string().max(60).nullable().optional(),
  ctaUrl: z.string().url().nullable().optional(),
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

  const html = buildHtml({
    message: parsed.message,
    contentType: parsed.contentType,
    ctaLabel: parsed.ctaLabel ?? null,
    ctaUrl: parsed.ctaUrl ?? null,
    unsubscribeUrl,
  });
  const plainMessage = parsed.contentType === "html" ? stripHtml(parsed.message) : parsed.message;

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
        html,
        text: `${plainMessage}${parsed.ctaLabel && parsed.ctaUrl ? `\n\n${parsed.ctaLabel}: ${parsed.ctaUrl}` : ""}\n\n---\n${PHYSICAL_ADDRESS}\n${
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
