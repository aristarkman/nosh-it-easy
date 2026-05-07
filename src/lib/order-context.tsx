import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { MenuItem, ModifierOption } from "./menu-types";
import { syncAbandonedCart, track } from "./analytics";
import { supabase } from "@/integrations/supabase/client";

export type LocationId = "glen-rock" | "cresskill";
export type OrderType = "pickup" | "delivery";

export type CartLine = {
  lineId: string;
  itemId: string;
  name: string;
  basePrice: number;
  quantity: number;
  modifiers: { groupId: string; groupName: string; options: ModifierOption[] }[];
  notes?: string;
  unitPrice: number; // base + modifiers
};

type OrderState = {
  location: LocationId | null;
  orderType: OrderType | null;
  cart: CartLine[];
};

type Ctx = OrderState & {
  setLocation: (l: LocationId) => void;
  setOrderType: (t: OrderType) => void;
  addToCart: (line: Omit<CartLine, "lineId">) => void;
  removeLine: (lineId: string) => void;
  updateQty: (lineId: string, qty: number) => void;
  clearCart: () => void;
  subtotal: number;
  totalQty: number;
};

const OrderContext = createContext<Ctx | null>(null);
const KEY = "kn-order-v1";

export function OrderProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OrderState>({ location: null, orderType: null, cart: [] });

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
      if (raw) setState(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  // Debounced abandoned-cart sync to Supabase
  const syncTimer = useRef<number | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (syncTimer.current) window.clearTimeout(syncTimer.current);
    const subtotalNow = state.cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
    syncTimer.current = window.setTimeout(async () => {
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
      } catch {}
      void syncAbandonedCart({
        cart: state.cart,
        subtotal: subtotalNow,
        locationId: state.location,
        orderType: state.orderType,
        customerName: name,
        email,
        phone,
        marketingEmailOptIn: optEmail,
        marketingSmsOptIn: optSms,
      });
    }, 1500);
    return () => {
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
    };
  }, [state]);

  const setLocation = (location: LocationId) => setState((s) => ({ ...s, location }));
  const setOrderType = (orderType: OrderType) => setState((s) => ({ ...s, orderType }));
  const addToCart = (line: Omit<CartLine, "lineId">) => {
    setState((s) => ({ ...s, cart: [...s.cart, { ...line, lineId: crypto.randomUUID() }] }));
    void track("add_to_cart", {
      props: { itemId: line.itemId, name: line.name, quantity: line.quantity, unitPrice: line.unitPrice },
      locationId: state.location,
      orderType: state.orderType,
    });
  };
  const removeLine = (lineId: string) =>
    setState((s) => ({ ...s, cart: s.cart.filter((l) => l.lineId !== lineId) }));
  const updateQty = (lineId: string, qty: number) =>
    setState((s) => ({
      ...s,
      cart: s.cart
        .map((l) => (l.lineId === lineId ? { ...l, quantity: Math.max(0, qty) } : l))
        .filter((l) => l.quantity > 0),
    }));
  const clearCart = () => setState((s) => ({ ...s, cart: [] }));

  const subtotal = state.cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const totalQty = state.cart.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <OrderContext.Provider
      value={{ ...state, setLocation, setOrderType, addToCart, removeLine, updateQty, clearCart, subtotal, totalQty }}
    >
      {children}
    </OrderContext.Provider>
  );
}

export function useOrder() {
  const ctx = useContext(OrderContext);
  if (!ctx) throw new Error("useOrder must be used inside OrderProvider");
  return ctx;
}

export const LOCATIONS: { id: LocationId; name: string; address: string; phone: string; hours: string }[] = [
  {
    id: "glen-rock",
    name: "Glen Rock",
    address: "230 Rock Rd, Glen Rock, NJ",
    phone: "(201) 445-1186",
    hours: "Open today · 7am – 8pm",
  },
  {
    id: "cresskill",
    name: "Cresskill",
    address: "27 Union Ave, Cresskill, NJ",
    phone: "(201) 331-0000",
    hours: "Open today · 7am – 8pm",
  },
];

export const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function buildLineFromItem(
  item: MenuItem,
  selections: Record<string, ModifierOption[]>,
  quantity: number,
  notes?: string
): Omit<CartLine, "lineId"> {
  const modifiers = Object.entries(selections)
    .filter(([, opts]) => opts.length)
    .map(([groupId, options]) => {
      const g = item.modifierGroups?.find((x) => x.id === groupId);
      return { groupId, groupName: g?.name ?? groupId, options };
    });
  const modPrice = modifiers.reduce(
    (s, m) => s + m.options.reduce((a, o) => a + (o.price ?? 0), 0),
    0
  );
  const unitPrice = item.price + modPrice;
  return {
    itemId: item.id,
    name: item.name,
    basePrice: item.price,
    quantity,
    modifiers,
    notes,
    unitPrice,
  };
}
