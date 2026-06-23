export function slugify(input: string): string {
  const s = (input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return s || `item-${Math.random().toString(36).slice(2, 8)}`;
}
