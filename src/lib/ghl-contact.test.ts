import { describe, expect, it } from "vitest";
import { buildGhlOrderContact } from "./ghl-contact";

const customer = { customer_name: "Test Customer", customer_email: "test@example.com", customer_phone: "201-555-0100", email_consent: false, sms_consent: false };

describe("GoHighLevel order marketing rules", () => {
  it("excludes customers without marketing opt-in, even with contact details", () => {
    expect(buildGhlOrderContact(customer, "location")).toBeNull();
  });
  it("sends email only for email marketing consent", () => {
    const result = buildGhlOrderContact({ ...customer, email_consent: true }, "location");
    expect(result?.body.email).toBe("test@example.com");
    expect(result?.body.phone).toBeUndefined();
  });
  it("sends phone only for SMS marketing consent", () => {
    const result = buildGhlOrderContact({ ...customer, sms_consent: true }, "location");
    expect(result?.body.phone).toBe("+12015550100");
    expect(result?.body.email).toBeUndefined();
  });
  it("does not overwrite existing provider tags or clear opt-outs", () => {
    const result = buildGhlOrderContact({ ...customer, email_consent: true }, "location");
    expect(result?.body).not.toHaveProperty("tags");
    expect(result?.body).not.toHaveProperty("dnd");
    expect(result?.body).not.toHaveProperty("dndSettings");
  });
});