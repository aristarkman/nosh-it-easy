import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  address: z.string().min(5).max(500),
  locationId: z.string().min(1).max(100),
  subtotal: z.number().min(0),
});

export const verifyDeliveryZone = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const { verifyZone } = await import("@/lib/delivery-zone.server");
    return verifyZone(data);
  });
