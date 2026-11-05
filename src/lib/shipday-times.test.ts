import { describe, expect, it } from "vitest";
import { PICKUP_LEAD_MINUTES, driverPickupIso, shipdayScheduleFields } from "./shipday-times";

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
