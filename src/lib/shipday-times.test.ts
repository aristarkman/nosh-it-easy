import { describe, expect, it } from "vitest";
import {
  PICKUP_LEAD_MINUTES,
  driverPickupIso,
  pickupFromDriveSeconds,
  pickupNoteSegment,
  shipdayScheduleFields,
} from "./shipday-times";

describe("shipdayScheduleFields", () => {
  it("sends the customer's 2:30pm EDT time as the delivery time, with pickup earlier", () => {
    // 2:30pm EDT = 18:30 UTC
    const f = shipdayScheduleFields("2026-07-23T18:30:00.000Z");
    expect(f.expectedDeliveryDate).toBe("2026-07-23");
    expect(f.expectedDeliveryTime).toBe("18:30:00");
    expect(f.expectedPickupTime).toBe("18:00:00");
    expect(PICKUP_LEAD_MINUTES).toBe(30);
  });

  it("works in winter (EST) since everything is UTC", () => {
    // 2:30pm EST = 19:30 UTC
    const f = shipdayScheduleFields("2026-01-15T19:30:00.000Z");
    expect(f.expectedDeliveryTime).toBe("19:30:00");
    expect(f.expectedPickupTime).toBe("19:00:00");
  });

  it("clamps pickup to 00:00:00 when it would land on the previous UTC day", () => {
    // 8:10pm EDT = 00:10 UTC the next day; pickup would be 23:40 UTC the day before
    const f = shipdayScheduleFields("2026-07-24T00:10:00.000Z");
    expect(f.expectedDeliveryDate).toBe("2026-07-24");
    expect(f.expectedDeliveryTime).toBe("00:10:00");
    expect(f.expectedPickupTime).toBe("00:00:00");
  });

  it("never schedules pickup after delivery", () => {
    for (const iso of ["2026-07-23T00:00:00.000Z", "2026-07-23T00:29:00.000Z", "2026-07-23T12:00:00.000Z"]) {
      const f = shipdayScheduleFields(iso);
      expect(f.expectedPickupTime <= f.expectedDeliveryTime).toBe(true);
    }
  });

  it("driverPickupIso is the customer time minus the pickup lead", () => {
    expect(driverPickupIso("2026-07-23T18:30:00.000Z")).toBe("2026-07-23T18:00:00.000Z");
    expect(driverPickupIso("2026-07-24T00:10:00.000Z")).toBe("2026-07-23T23:40:00.000Z");
  });
});

describe("stored pickup time (from the Google estimate)", () => {
  const delivery = "2026-07-23T18:30:00.000Z";

  it("is preferred over the default lead, wherever it sits in the notes", () => {
    const notes = `note:no onions | tip:2.00 | ${pickupNoteSegment("2026-07-23T18:10:00.000Z")} | delivery:shipday`;
    expect(driverPickupIso(delivery, notes)).toBe("2026-07-23T18:10:00.000Z");
    const f = shipdayScheduleFields(delivery, notes);
    expect(f.expectedPickupTime).toBe("18:10:00");
    expect(f.expectedDeliveryTime).toBe("18:30:00");
  });

  it("is ignored when implausible, falling back to the default lead", () => {
    for (const bad of [
      "2026-07-23T18:25:00.000Z", // only 5 min of lead
      "2026-07-23T18:40:00.000Z", // after delivery
      "2026-07-23T15:00:00.000Z", // 3.5 hours early
    ]) {
      expect(driverPickupIso(delivery, `pickup:${bad}`)).toBe("2026-07-23T18:00:00.000Z");
    }
    expect(driverPickupIso(delivery, "pickup:garbage")).toBe("2026-07-23T18:00:00.000Z");
    expect(driverPickupIso(delivery, null)).toBe("2026-07-23T18:00:00.000Z");
  });

  it("pickupFromDriveSeconds adds the handoff buffer, rounds up to 5 min, and clamps", () => {
    // 12 min drive + 5 handoff = 17 -> 20 min before
    expect(pickupFromDriveSeconds(delivery, 12 * 60)).toBe("2026-07-23T18:10:00.000Z");
    // exactly 15 min drive + 5 = 20 -> 20
    expect(pickupFromDriveSeconds(delivery, 15 * 60)).toBe("2026-07-23T18:10:00.000Z");
    // 1 min drive -> clamped up to the 10 min minimum
    expect(pickupFromDriveSeconds(delivery, 60)).toBe("2026-07-23T18:20:00.000Z");
    // 3 hour drive -> clamped down to the 90 min maximum
    expect(pickupFromDriveSeconds(delivery, 3 * 3600)).toBe("2026-07-23T17:00:00.000Z");
  });

  it("round-trips through the notes protocol", () => {
    const pickup = pickupFromDriveSeconds(delivery, 18 * 60);
    expect(driverPickupIso(delivery, `tip:1.00 | ${pickupNoteSegment(pickup)}`)).toBe(pickup);
  });
});
