import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const InputSchema = z.object({
  promoCodeId: z.string().uuid(),
  orderId: z.string().uuid(),
  discountAmount: z.number().min(0).max(10000),
  customerPhone: z.string().trim().max(32).optional().nullable(),
  userId: z.string().uuid().optional().nullable(),
});

export const recordPromoRedemption = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    // Verify order exists and pull subtotal to bound the discount
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, user_id, subtotal, total")
      .eq("id", data.orderId)
      .maybeSingle();
    if (orderErr || !order) {
      return { ok: false as const, message: "Order not found" };
    }

    // Verify promo code is active and re-bound discount to its allowed value
    const { data: promo, error: promoErr } = await supabaseAdmin
      .from("promo_codes")
      .select("id, active, discount_type, discount_value, min_subtotal, starts_at, expires_at")
      .eq("id", data.promoCodeId)
      .maybeSingle();
    if (promoErr || !promo || !promo.active) {
      return { ok: false as const, message: "Invalid promo code" };
    }
    const now = Date.now();
    if (promo.starts_at && new Date(promo.starts_at).getTime() > now) {
      return { ok: false as const, message: "Promo not yet active" };
    }
    if (promo.expires_at && new Date(promo.expires_at).getTime() < now) {
      return { ok: false as const, message: "Promo expired" };
    }
    if (Number(order.subtotal ?? 0) < Number(promo.min_subtotal ?? 0)) {
      return { ok: false as const, message: "Subtotal below promo minimum" };
    }

    // Cap discount at order subtotal — server is the source of truth
    const cappedDiscount = Math.min(
      Math.max(0, Number(data.discountAmount) || 0),
      Number(order.subtotal ?? 0),
    );

    // If the order is owned by a user, force user_id to match — never trust client
    const userId = order.user_id ?? data.userId ?? null;

    const { error: insertErr } = await supabaseAdmin
      .from("promo_redemptions")
      .insert({
        promo_code_id: promo.id,
        order_id: order.id,
        user_id: userId,
        customer_phone: data.customerPhone?.trim() || null,
        discount_amount: cappedDiscount,
      });
    if (insertErr) {
      return { ok: false as const, message: insertErr.message };
    }
    return { ok: true as const };
  });
