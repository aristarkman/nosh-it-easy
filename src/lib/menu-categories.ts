import type { Category } from "./menu-types";

// Curated, customer-facing categories — order matters.
export const CATEGORIES: Category[] = [
  { id: "sandwiches", name: "Classic Sandwiches", blurb: "Hand-carved, piled high, on fresh-baked rye." },
  { id: "platters", name: "Deli Platters" },
  { id: "soups", name: "Soups & Sides" },
  { id: "breakfast", name: "All-Day Breakfast" },
  { id: "knishes", name: "Knishes & Latkes" },
  { id: "entrees", name: "Entrées" },
  { id: "snacks", name: "Snacks" },
  { id: "drinks", name: "Drinks" },
  { id: "desserts", name: "Desserts" },
  { id: "catering", name: "Catering" },
  { id: "other", name: "More from the Deli" },
];

// Map raw Biyo category strings to a curated bucket id above.
// Anything not matched falls into "other".
const RULES: Array<{ test: (raw: string) => boolean; bucket: string }> = [
  { test: (r) => /sandwich/i.test(r), bucket: "sandwiches" },
  { test: (r) => /platter|smoked fish|tower/i.test(r), bucket: "platters" },
  { test: (r) => /soup/i.test(r), bucket: "soups" },
  { test: (r) => /side|salad/i.test(r), bucket: "soups" },
  { test: (r) => /egg|breakfast|nosh/i.test(r), bucket: "breakfast" },
  { test: (r) => /knish|latke/i.test(r), bucket: "knishes" },
  { test: (r) => /entr[ée]e|broiler|kids|hot open/i.test(r), bucket: "entrees" },
  { test: (r) => /snack|extras|merch/i.test(r), bucket: "snacks" },
  { test: (r) => /beverage|drink/i.test(r), bucket: "drinks" },
  { test: (r) => /dessert/i.test(r), bucket: "desserts" },
  { test: (r) => /cater|passover|appetizer/i.test(r), bucket: "catering" },
  { test: (r) => /deli|freezer|refrigerator|frozen|restaurant/i.test(r), bucket: "other" },
];

export function bucketFor(rawCategory: string | null | undefined): string {
  if (!rawCategory) return "other";
  for (const r of RULES) if (r.test(rawCategory)) return r.bucket;
  return "other";
}
