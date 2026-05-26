// Google Tag (gtag.js) + Meta Pixel helpers.
// Scripts are injected from src/routes/__root.tsx. These helpers fire events.

export const GOOGLE_ADS_ID = "AW-18036296296";
export const GOOGLE_CONVERSION_LABEL = "sAuYCMKT6LMcEOiUsJhD";
export const META_PIXEL_ID = "318948217869757";



declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
    fbq?: (...args: unknown[]) => void;
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

function fbq(...args: unknown[]) {
  if (typeof window === "undefined") return;
  try {
    if (typeof window.fbq === "function") window.fbq(...args);
  } catch {}
}

export function trackPageView(path?: string) {
  gtag("event", "page_view", { page_path: path ?? (typeof window !== "undefined" ? window.location.pathname : undefined) });
  fbq("track", "PageView");
}

export function trackAddToCart(input: { value: number; itemId: string; name: string; quantity: number }) {
  gtag("event", "add_to_cart", {
    currency: "USD",
    value: input.value,
    items: [{ item_id: input.itemId, item_name: input.name, quantity: input.quantity, price: input.value / Math.max(1, input.quantity) }],
  });
  fbq("track", "AddToCart", {
    content_ids: [input.itemId],
    content_name: input.name,
    content_type: "product",
    value: input.value,
    currency: "USD",
    num_items: input.quantity,
  });
}

export function trackBeginCheckout(input: { value: number; numItems: number }) {
  gtag("event", "begin_checkout", { currency: "USD", value: input.value });
  fbq("track", "InitiateCheckout", {
    value: input.value,
    currency: "USD",
    num_items: input.numItems,
  });
}

export function trackPurchase(input: { orderId: string; value: number }) {
  gtag("event", "purchase", {
    transaction_id: input.orderId,
    value: input.value,
    currency: "USD",
  });
  gtag("event", "conversion", {
    send_to: `${GOOGLE_ADS_ID}/${GOOGLE_CONVERSION_LABEL}`,
    value: input.value,
    currency: "USD",
    transaction_id: input.orderId,
  });
  fbq("track", "Purchase", {
    value: input.value,
    currency: "USD",
    content_type: "product",
    content_ids: [input.orderId],
  });
}
