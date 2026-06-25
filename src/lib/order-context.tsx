import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { MenuItem, ModifierOption } from "./menu-types";
import { track } from "./analytics";
import { trackAddToCart } from "./tracking";
import { useCartSync } from "./use-cart-sync";

export type LocationId = "glen-rock" | "cresskill";
export type OrderType = "pickup" | "delivery";
export type WhenType = "asap" | "schedule";

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
  whenType: WhenType | null;
  scheduledTime: string | null;
  cart: CartLine[];
};

type Ctx = OrderState & {
  setLocation: (l: LocationId) => void;
  setOrderType: (t: OrderType) => void;
  setWhen: (when: WhenType, scheduledTime?: string | null) => void;
  addToCart: (line: Omit<CartLine, "lineId">) => void;
  removeLine: (lineId: string) => void;
  updateQty: (lineId: string, qty: number) => void;
  clearCart: () => void;
  subtotal: number;
  totalQty: number;
};

const OrderContext = createContext<Ctx | null>(null);

// ---------- Persisted state (versioned) ----------
const STORAGE_KEY = "kn-order";
const SCHEMA_VERSION = 2;
const LEGACY_KEYS = ["kn-order-v1"];

type Persisted = { v: number; state: OrderState };

const EMPTY: OrderState = { location: null, orderType: null, cart: [] };

function isOrderState(x: unknown): x is OrderState {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return "cart" in o && Array.isArray(o.cart);
}

function migrate(raw: unknown): OrderState | null {
  // Current shape: { v, state }
  if (raw && typeof raw === "object" && "v" in (raw as object) && "state" in (raw as object)) {
    const p = raw as Partial<Persisted>;
    if (p.v === SCHEMA_VERSION && isOrderState(p.state)) return p.state;
    // Future migrations from older versioned shapes go here.
    if (isOrderState(p.state)) return p.state;
    return null;
  }
  // Legacy v1 stored the raw OrderState under "kn-order-v1".
  if (isOrderState(raw)) return raw;
  return null;
}

function loadState(): OrderState {
  if (typeof window === "undefined") return EMPTY;
  // Try current key.
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const migrated = migrate(parsed);
      if (migrated) return migrated;
    }
  } catch (e) {
    console.warn("[order] failed to parse persisted cart, resetting", e);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }
  // Try legacy keys (one-shot migration).
  for (const key of LEGACY_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const migrated = migrate(parsed);
      localStorage.removeItem(key);
      if (migrated) return migrated;
    } catch {
      try { localStorage.removeItem(key); } catch {}
    }
  }
  return EMPTY;
}

function saveState(state: OrderState) {
  if (typeof window === "undefined") return;
  try {
    const payload: Persisted = { v: SCHEMA_VERSION, state };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn("[order] failed to persist cart", e);
  }
}

export function OrderProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OrderState>(EMPTY);

  // Hydrate from storage after mount (avoid SSR mismatch).
  useEffect(() => {
    setState(loadState());
  }, []);

  useEffect(() => {
    saveState(state);
  }, [state]);

  // Abandoned-cart sync lives in its own hook now.
  useCartSync({ cart: state.cart, location: state.location, orderType: state.orderType });

  const setLocation = (location: LocationId) => setState((s) => ({ ...s, location }));
  const setOrderType = (orderType: OrderType) => setState((s) => ({ ...s, orderType }));
  const addToCart = (line: Omit<CartLine, "lineId">) => {
    setState((s) => ({ ...s, cart: [...s.cart, { ...line, lineId: crypto.randomUUID() }] }));
    void track("add_to_cart", {
      props: { itemId: line.itemId, name: line.name, quantity: line.quantity, unitPrice: line.unitPrice },
      locationId: state.location,
      orderType: state.orderType,
    });
    trackAddToCart({ value: line.unitPrice * line.quantity, itemId: line.itemId, name: line.name, quantity: line.quantity });
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
    address: "894 PROSPECT ST, GLEN ROCK, NJ 07452",
    phone: "(201) 445-1186",
    hours: "Open today · 7am – 8pm",
  },
  {
    id: "cresskill",
    name: "Cresskill",
    address: "172 PIERMONT ROAD, CRESSKILL, NJ 07626",
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
