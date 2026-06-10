import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  POINTS_PER_DOLLAR,
  POINTS_PER_REWARD,
  REWARD_VALUE,
} from "@/lib/loyalty";

const Schema = z.object({
  orderId: z.string().uuid(),
  rewardsRedeemed: z.number().int().min(0).max(1000),
});

export const recordLoyaltyForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof Schema>) => Schema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = (context as { userId: string }).userId;

    // Verify the order belongs to the user
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, subtotal, user_id")
      .eq("id", data.orderId)
      .maybeSingle();
    if (orderErr) throw new Error(orderErr.message);
    if (!order || order.user_id !== userId) throw new Error("Order not found");

    // Compute server-side
    const redeemPts = data.rewardsRedeemed * POINTS_PER_REWARD;
    const discount = data.rewardsRedeemed * REWARD_VALUE;
    const earnBase = Math.max(0, Number(order.subtotal) - discount);
    const earnPts = Math.floor(earnBase * POINTS_PER_DOLLAR);

    // Validate balance covers redemption
    if (redeemPts > 0) {
      const { data: bal } = await supabaseAdmin.rpc("loyalty_balance", { _user_id: userId });
      const balance = typeof bal === "number" ? bal : 0;
      if (balance < redeemPts) throw new Error("Insufficient loyalty points");

      await supabaseAdmin.from("loyalty_redemptions").insert({
        user_id: userId,
        order_id: order.id,
        amount: discount,
        points_used: redeemPts,
      });
      await supabaseAdmin.from("loyalty_ledger").insert({
        user_id: userId,
        order_id: order.id,
        kind: "redeem",
        points: -redeemPts,
        note: `Redeemed ${data.rewardsRedeemed} reward(s)`,
      });
    }
    if (earnPts > 0) {
      await supabaseAdmin.from("loyalty_ledger").insert({
        user_id: userId,
        order_id: order.id,
        kind: "earn",
        points: earnPts,
        note: `Earned on order #${order.order_number}`,
      });
    }
    return { ok: true, earnPts, redeemPts };
  });
