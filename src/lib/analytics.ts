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
    const { upsertAbandonedCart } = await import("@/lib/abandoned-cart.functions");
    const sid = getSessionId();
    const { data: sess } = await supabase.auth.getSession();
    const userId = sess.session?.user.id ?? null;
    const itemCount = input.cart.reduce((s, l) => s + l.quantity, 0);

    await upsertAbandonedCart({
      data: {
        sessionId: sid,
        userId,
        customerName: input.customerName ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        locationId: input.locationId,
        orderType: input.orderType,
        items: input.cart as unknown as Array<Record<string, unknown>> as never,
        subtotal: input.subtotal,
        itemCount,
        marketingEmailOptIn: input.marketingEmailOptIn ?? false,
        marketingSmsOptIn: input.marketingSmsOptIn ?? false,
      },
    });
  } catch (e) {
    console.warn("[analytics] syncAbandonedCart failed", e);
  }
}

export async function markCartRecovered(orderId: string) {
  if (typeof window === "undefined") return;
  try {
    const { markAbandonedCartRecovered } = await import("@/lib/abandoned-cart.functions");
    const sid = getSessionId();
    await markAbandonedCartRecovered({ data: { sessionId: sid, orderId } });
  } catch (e) {
    console.warn("[analytics] markCartRecovered failed", e);
  }
}
