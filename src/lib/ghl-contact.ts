import { z } from "zod";

export const GhlOrderContactSchema = z.object({
  customer_name: z.string().max(200),
  customer_email: z.string().nullable(),
  customer_phone: z.string().nullable(),
  email_consent: z.boolean(),
  sms_consent: z.boolean(),
});

export function buildGhlOrderContact(input: unknown, locationId: string) {
  const data = GhlOrderContactSchema.parse(input);
  const email = data.email_consent ? z.string().email().safeParse(data.customer_email?.trim()) : null;
  const digits = data.customer_phone?.replace(/\D/g, "") ?? "";
  const phone = data.sms_consent
    ? digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : undefined
    : undefined;
  const validEmail = email?.success ? email.data.toLowerCase() : undefined;
  if (!validEmail && !phone) return null;
  const [firstName, ...last] = data.customer_name.trim().split(/\s+/);
  return {
    body: { locationId, firstName: firstName || undefined, lastName: last.join(" ") || undefined, email: validEmail, phone },
    tags: ["kosher-nosh-order-customer", ...(validEmail ? ["kosher-nosh-email-opt-in"] : []), ...(phone ? ["kosher-nosh-sms-opt-in"] : [])],
  };
}