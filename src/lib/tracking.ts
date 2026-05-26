// Meta Pixel + Google Tag (GTM/Ads) helpers.
// Scripts are injected from src/routes/__root.tsx. These helpers fire events.

export const META_PIXEL_ID = "318948217869757";
export const GTM_IDS = ["GTM-MBKVX6Z5", "GT-NCN5WBBD"] as const;
export const GOOGLE_ADS_ID = "AW-18036296296";

type AnyObj = Record<string, unknown>;

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

function fbq(event: string, params?: AnyObj) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  try {
    window.fbq("track", event, params);
  } catch {}
}

function gtag(...args: unknown[]) {
  if (typeof window === "undefined") return;
  try {
    if (typeof window.gtag === "function") window.gtag(...args);
    else {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(args);
    }
  } catch {}
}

export function trackPageView(path?: string) {
  fbq("PageView");
  gtag("event", "page_view", { page_path: path ?? (typeof window !== "undefined" ? window.location.pathname : undefined) });
}

export function trackAddToCart(input: { value: number; itemId: string; name: string; quantity: number }) {
  fbq("AddToCart", {
    content_ids: [input.itemId],
    content_name: input.name,
    content_type: "product",
    value: input.value,
    currency: "USD",
    num_items: input.quantity,
  });
  gtag("event", "add_to_cart", {
    currency: "USD",
    value: input.value,
    items: [{ item_id: input.itemId, item_name: input.name, quantity: input.quantity, price: input.value / Math.max(1, input.quantity) }],
  });
}

export function trackBeginCheckout(input: { value: number; numItems: number }) {
  fbq("InitiateCheckout", { value: input.value, currency: "USD", num_items: input.numItems });
  gtag("event", "begin_checkout", { currency: "USD", value: input.value });
}

export function trackPurchase(input: { orderId: string; value: number }) {
  fbq("Purchase", { value: input.value, currency: "USD" }, { eventID: input.orderId });
  gtag("event", "purchase", {
    transaction_id: input.orderId,
    value: input.value,
    currency: "USD",
    send_to: GOOGLE_ADS_ID,
  });
  // Also fire a generic purchase event for GA4/GTM containers
  gtag("event", "purchase", {
    transaction_id: input.orderId,
    value: input.value,
    currency: "USD",
  });
}
