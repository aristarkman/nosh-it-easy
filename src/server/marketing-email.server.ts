// Sends branded marketing emails directly from the app server via Resend.
//
// This used to go through a Supabase edge function (`send-marketing-email`),
// which was never deployed -- test sends silently failed. Sending from here
// keeps everything in one deploy and removes the extra hop.

import { createHmac } from "node:crypto";

const FROM_ADDRESS = "The Kosher Nosh <orders@takeout.koshernosh.com>";
const SITE_URL = "https://takeout.koshernosh.com";
const BRAND_COLOR = "#D6472E";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function nl2br(s: string): string {
  return esc(s).replace(/\n/g, "<br>");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildHtml(input: {
  message: string;
  contentType: "text" | "html";
  ctaLabel: string | null;
  ctaUrl: string | null;
  unsubscribeUrl: string | null;
  physicalAddress: string;
}): string {
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
              ${esc(input.physicalAddress)}<br>
              ${unsubLine}
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export async function sendMarketingEmail(input: {
  to: string;
  subject: string;
  message: string;
  contentType?: "text" | "html";
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  includeOneClickUnsubscribe?: boolean;
}): Promise<{ id: string | null }> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const physicalAddress =
    process.env["BUSINESS_MAILING_ADDRESS"] ?? "230 Rock Rd, Glen Rock, NJ 07452";
  const unsubscribeSecret = process.env["UNSUBSCRIBE_SECRET"] ?? "";

  const unsubscribeUrl =
    input.includeOneClickUnsubscribe && unsubscribeSecret
      ? `${SITE_URL}/api/public/hooks/unsubscribe-email?email=${encodeURIComponent(
          input.to,
        )}&token=${createHmac("sha256", unsubscribeSecret)
          .update(input.to.toLowerCase())
          .digest("hex")
          .slice(0, 32)}`
      : null;

  const contentType = input.contentType === "html" ? "html" : "text";
  const html = buildHtml({
    message: input.message,
    contentType,
    ctaLabel: input.ctaLabel ?? null,
    ctaUrl: input.ctaUrl ?? null,
    unsubscribeUrl,
    physicalAddress,
  });
  const plainMessage = contentType === "html" ? stripHtml(input.message) : input.message;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [input.to],
      subject: input.subject,
      html,
      text: `${plainMessage}${
        input.ctaLabel && input.ctaUrl ? `\n\n${input.ctaLabel}: ${input.ctaUrl}` : ""
      }\n\n---\n${physicalAddress}\n${
        unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : "Reply to this email to unsubscribe."
      }`,
      ...(unsubscribeUrl ? { headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` } } : {}),
    }),
  });

  const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) {
    throw new Error(`Resend error [${res.status}]: ${data?.message ?? "send failed"}`);
  }
  return { id: data?.id ?? null };
}
