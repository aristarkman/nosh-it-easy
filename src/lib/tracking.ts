// Google Tag (gtag.js) helpers.
// Scripts are injected from src/routes/__root.tsx. These helpers fire events.

export const GOOGLE_ADS_ID = "AW-18036296296";
export const GOOGLE_CONVERSION_LABEL = "sAuYCMKT6LMcEOiUsJhD";


declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
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
  gtag("event", "page_view", { page_path: path ?? (typeof window !== "undefined" ? window.location.pathname : undefined) });
}

export function trackAddToCart(input: { value: number; itemId: string; name: string; quantity: number }) {
  gtag("event", "add_to_cart", {
    currency: "USD",
    value: input.value,
    items: [{ item_id: input.itemId, item_name: input.name, quantity: input.quantity, price: input.value / Math.max(1, input.quantity) }],
  });
}

export function trackBeginCheckout(input: { value: number; numItems: number }) {
  gtag("event", "begin_checkout", { currency: "USD", value: input.value });
}

export function trackPurchase(input: { orderId: string; value: number }) {
  gtag("event", "purchase", {
    transaction_id: input.orderId,
    value: input.value,
    currency: "USD",
    send_to: GOOGLE_ADS_ID,
  });
}
