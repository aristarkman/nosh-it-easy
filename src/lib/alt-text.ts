import type { LocationId } from "./order-context";

const LOC_LABEL: Record<LocationId, string> = {
  "glen-rock": "Glen Rock",
  cresskill: "Cresskill",
};

export const DEFAULT_ALT = "The Kosher Nosh - Kosher Deli New Jersey";
export const LOGO_ALT =
  "The Famous Kosher Nosh - Kosher Deli Glen Rock and Cresskill NJ";

export function menuItemAlt(name: string, location?: LocationId | null) {
  const city = location ? LOC_LABEL[location] : null;
  return city
    ? `${name} - The Kosher Nosh, ${city} NJ`
    : `${name} - The Kosher Nosh, New Jersey`;
}
