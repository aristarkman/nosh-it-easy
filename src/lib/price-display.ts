// Shared display helpers for sold-by-the-pound items, price label overrides,
// and package unit suffixes. Used by the tile, product dialog, cart, and
// admin editor so formatting stays consistent everywhere.

export const POUND_STEP = 0.25;
export const DEFAULT_MIN_POUNDS = 0.5;

/** "1.50" -> "1.5", "2.00" -> "2", "0.25" -> "0.25" */
export function formatQuantity(n: number, soldByPound?: boolean): string {
  if (!soldByPound) return String(n);
  const rounded = Math.round(n * 100) / 100;
  const trimmed = rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${trimmed} lb`;
}

/** Snaps to the nearest quarter-pound, never below the item's minimum. */
export function clampPounds(n: number, minimum: number | null | undefined): number {
  const min = minimum ?? DEFAULT_MIN_POUNDS;
  const snapped = Math.round(n / POUND_STEP) * POUND_STEP;
  return Math.max(min, Math.round(snapped * 100) / 100);
}

export function isValidPoundQuantity(n: number, minimum: number | null | undefined): boolean {
  const min = minimum ?? DEFAULT_MIN_POUNDS;
  if (n < min - 1e-9) return false;
  const steps = (n - min) / POUND_STEP;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}

type PriceDisplayItem = {
  price: number;
  priceLabel?: string | null;
  soldByPound?: boolean;
  isPackage?: boolean;
};

/** Short suffix appended right after the numeric price, e.g. "$38.98 / lb". */
export function unitSuffix(item: PriceDisplayItem): string {
  if (item.soldByPound) return " / lb";
  if (item.isPackage) return " per person";
  return "";
}

/**
 * What to show where a price normally goes. Returns either the literal
 * price_label text (feature 2) or a formatted "$X.XX" + unit suffix.
 * `fmt` is passed in so this stays framework-agnostic (order-context.tsx
 * owns the currency formatter).
 */
export function priceDisplay(item: PriceDisplayItem, fmt: (n: number) => string): string {
  if (item.priceLabel) return item.priceLabel;
  return `${fmt(item.price)}${unitSuffix(item)}`;
}
