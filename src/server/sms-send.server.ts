// Server-only Twilio sender shared by the marketing drip runner.
// (sms.functions.ts keeps its own copy because *.functions.ts modules are
// client-reachable and may not import *.server.ts at module scope.)

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";
const FROM_NUMBER = "+16097401249";

export function normalizePhone(raw: string): string | null {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (raw.trim().startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** Adds the brand prefix and STOP footer required for marketing texts. */
export function buildMarketingSmsBody(message: string): string {
  let body = message.trim();
  if (!/reply stop/i.test(body)) body += " Reply STOP to opt out.";
  if (!/^the kosher nosh/i.test(body)) body = `The Kosher Nosh: ${body}`;
  return body;
}

export async function sendSms(to: string, body: string) {
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
  if (!res.ok) throw new Error(`Twilio error [${res.status}]: ${JSON.stringify(data)}`);
  return data;
}
