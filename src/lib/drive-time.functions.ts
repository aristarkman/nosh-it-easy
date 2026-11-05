import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MAX_DAYS_AHEAD = 120;

// Called from checkout (before payment) for scheduled deliveries. pickupIso
// is null when Google can't give an estimate; callers then just don't store
// one and everything falls back to the default pickup lead.
export const estimateDriverPickup = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        locationId: z.enum(["glen-rock", "cresskill"]),
        address: z.string().min(5).max(500),
        scheduledTime: z.string().datetime(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const when = new Date(data.scheduledTime).getTime();
    const now = Date.now();
    if (when < now || when > now + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000) {
      return { ok: true as const, pickupIso: null, driveMinutes: null };
    }
    const { estimateDriverPickup: estimate } = await import("@/server/drive-time.server");
    const result = await estimate({
      locationId: data.locationId,
      address: data.address,
      deliveryIso: data.scheduledTime,
    });
    return {
      ok: true as const,
      pickupIso: result?.pickupIso ?? null,
      driveMinutes: result?.driveMinutes ?? null,
    };
  });
