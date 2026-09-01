// Client-side mirror of the email wrapper used in src/server/marketing-email.server.ts.
// Used only to render a live preview of a campaign in the admin composer.

const BRAND_COLOR = "#D6472E";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function nl2br(s: string): string {
  return esc(s).replace(/\n/g, "<br>");
}

export function buildEmailPreviewHtml(input: {
  message: string;
  contentType: "text" | "html";
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  physicalAddress?: string;
}): string {
  const body = input.contentType === "html" ? input.message : nl2br(input.message);
  const address = input.physicalAddress ?? "230 Rock Rd, Glen Rock, NJ 07452";

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

  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;">
    <table role="presentation" width="100%" style="background:#f4f4f5;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <tr><td style="padding:32px;">
            <div style="font-size:15px;line-height:1.65;color:#1a1a1a;">${body}</div>
            ${cta}
          </td></tr>
          <tr><td style="padding:20px 32px;background:#fafafa;">
            <p style="font-size:11px;color:#999;line-height:1.6;margin:0;">
              ${esc(address)}<br>
              <a href="#" style="color:#999;text-decoration:underline;">Unsubscribe</a>
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
