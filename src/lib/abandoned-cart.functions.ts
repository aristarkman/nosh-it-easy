import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CartLine = z.object({
  itemId: z.string().optional(),
  name: z.string().optional(),
  quantity: z.number().int().min(1).max(999),
  price: z.number().min(0).max(100000).optional(),
}).passthrough();

const UpsertSchema = z.object({
  sessionId: z.string().min(8).max(128),
  userId: z.string().uuid().nullable().optional(),
  customerName: z.string().max(120).nullable().optional(),
  email: z.string().email().max(200).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  locationId: z.string().max(80).nullable().optional(),
  orderType: z.string().max(40).nullable().optional(),
  items: z.array(CartLine).max(200),
  subtotal: z.number().min(0).max(100000),
  itemCount: z.number().int().min(0).max(9999),
  marketingEmailOptIn: z.boolean().optional(),
  marketingSmsOptIn: z.boolean().optional(),
});

export const upsertAbandonedCart = createServerFn({ method: "POST" })
  .inputValidator((input: z.infer<typeof UpsertSchema>) => UpsertSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.items.length === 0) {
      await supabaseAdmin
        .from("abandoned_carts")
        .update({ recovered: true, items: [] as never, item_count: 0, subtotal: 0 })
        .eq("session_id", data.sessionId);
      return { ok: true };
    }
    const { error } = await supabaseAdmin.from("abandoned_carts").upsert(
      {
        session_id: data.sessionId,
        user_id: data.userId ?? null,
        customer_name: data.customerName ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        location_id: data.locationId ?? null,
        order_type: data.orderType ?? null,
        items: data.items as unknown as never,
        subtotal: data.subtotal,
        item_count: data.itemCount,
        last_activity_at: new Date().toISOString(),
        recovered: false,
        marketing_email_opt_in: data.marketingEmailOptIn ?? false,
        marketing_sms_opt_in: data.marketingSmsOptIn ?? false,
      },
      { onConflict: "session_id" }
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const RecoverSchema = z.object({
  sessionId: z.string().min(8).max(128),
  orderId: z.string().uuid(),
});

export const markAbandonedCartRecovered = createServerFn({ method: "POST" })
  .inputValidator((input: z.infer<typeof RecoverSchema>) => RecoverSchema.parse(input))
  .handler(async ({ data }) => {
    await supabaseAdmin
      .from("abandoned_carts")
      .update({ recovered: true, recovered_order_id: data.orderId })
      .eq("session_id", data.sessionId);
    return { ok: true };
  });
