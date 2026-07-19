import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const AlertKind = z.enum([
  "payment_failed",
  "order_save_failed",
  "shipday_dispatch_failed",
  "sms_failed",
  "checkout_price_mismatch",
]);

const Schema = z.object({
  kind: AlertKind,
  message: z.string().min(1).max(2000),
  locationId: z.string().max(80).nullable().optional(),
  orderNumber: z.string().max(40).nullable().optional(),
  orderId: z.string().uuid().nullable().optional(),
  details: z.record(z.string(), z.any()).nullable().optional(),
});

export const recordSystemAlert = createServerFn({ method: "POST" })
  .inputValidator((input: z.infer<typeof Schema>) => Schema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("system_alerts").insert({
      kind: data.kind,
      message: data.message,
      location_id: data.locationId ?? null,
      order_number: data.orderNumber ?? null,
      order_id: data.orderId ?? null,
      details: (data.details ?? null) as never,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
