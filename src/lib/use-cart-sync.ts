import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { syncAbandonedCart } from "./analytics";
import type { CartLine, LocationId, OrderType } from "./order-context";

type Args = {
  cart: CartLine[];
  location: LocationId | null;
  orderType: OrderType | null;
  /** Debounce window in ms (default 1500). */
  debounceMs?: number;
};

/**
 * Debounced abandoned-cart sync. Watches cart/location/orderType and pushes
 * to the server after the user goes idle. Pulls profile + marketing opt-ins
 * for signed-in users so the server has everything it needs to re-engage.
 */
export function useCartSync({ cart, location, orderType, debounceMs = 1500 }: Args) {
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (timer.current) window.clearTimeout(timer.current);

    const subtotal = cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);

    timer.current = window.setTimeout(async () => {
      let email: string | null = null;
      let phone: string | null = null;
      let name: string | null = null;
      let optEmail = false;
      let optSms = false;
      try {
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess.session?.user.id;
        if (uid) {
          const { data: p } = await supabase
            .from("customer_profiles")
            .select("full_name,email,phone,marketing_email,marketing_sms")
            .eq("user_id", uid)
            .maybeSingle();
          if (p) {
            email = p.email;
            phone = p.phone;
            name = p.full_name;
            optEmail = !!p.marketing_email;
            optSms = !!p.marketing_sms;
          }
        }
      } catch (e) {
        console.warn("[cart-sync] profile fetch failed", e);
      }

      void syncAbandonedCart({
        cart,
        subtotal,
        locationId: location,
        orderType,
        customerName: name,
        email,
        phone,
        marketingEmailOptIn: optEmail,
        marketingSmsOptIn: optSms,
      });
    }, debounceMs);

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [cart, location, orderType, debounceMs]);
}
