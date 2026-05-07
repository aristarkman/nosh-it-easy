import { supabase } from "@/integrations/supabase/client";
import type { CartLine } from "@/lib/order-context";

const SESSION_KEY = "kn-session-id";

export function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

type EventProps = Record<string, unknown>;

export async function track(
  kind: string,
  opts: { props?: EventProps; locationId?: string | null; orderType?: string | null } = {}
) {
  if (typeof window === "undefined") return;
  try {
    const sid = getSessionId();
    const { data: sess } = await supabase.auth.getSession();
    await supabase.from("analytics_events").insert({
      session_id: sid,
      user_id: sess.session?.user.id ?? null,
      kind,
      location_id: opts.locationId ?? null,
      order_type: opts.orderType ?? null,
      properties: (opts.props ?? {}) as never,
    });
  } catch (e) {
    console.warn("[analytics] track failed", e);
  }
}

export type AbandonedCartUpsert = {
  cart: CartLine[];
  subtotal: number;
  locationId: string | null;
  orderType: string | null;
  customerName?: string | null;
  email?: string | null;
  phone?: string | null;
  marketingEmailOptIn?: boolean;
  marketingSmsOptIn?: boolean;
};

export async function syncAbandonedCart(input: AbandonedCartUpsert) {
  if (typeof window === "undefined") return;
  try {
    const sid = getSessionId();
    const { data: sess } = await supabase.auth.getSession();
    const userId = sess.session?.user.id ?? null;

    if (input.cart.length === 0) {
      // Mark recovered/cleared so reminder job skips it
      await supabase
        .from("abandoned_carts")
        .update({ recovered: true, items: [], item_count: 0, subtotal: 0 })
        .eq("session_id", sid);
      return;
    }

    const itemCount = input.cart.reduce((s, l) => s + l.quantity, 0);
    await supabase.from("abandoned_carts").upsert(
      {
        session_id: sid,
        user_id: userId,
        customer_name: input.customerName ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        location_id: input.locationId,
        order_type: input.orderType,
        items: input.cart as unknown as never,
        subtotal: input.subtotal,
        item_count: itemCount,
        last_activity_at: new Date().toISOString(),
        recovered: false,
        marketing_email_opt_in: input.marketingEmailOptIn ?? false,
        marketing_sms_opt_in: input.marketingSmsOptIn ?? false,
      },
      { onConflict: "session_id" }
    );
  } catch (e) {
    console.warn("[analytics] syncAbandonedCart failed", e);
  }
}

export async function markCartRecovered(orderId: string) {
  if (typeof window === "undefined") return;
  try {
    const sid = getSessionId();
    await supabase
      .from("abandoned_carts")
      .update({ recovered: true, recovered_order_id: orderId })
      .eq("session_id", sid);
  } catch (e) {
    console.warn("[analytics] markCartRecovered failed", e);
  }
}
