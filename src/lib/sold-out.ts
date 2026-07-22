// Shared "Sold out" / "Back at ..." label for a soldOutUntil timestamp.
export function soldOutLabel(soldOutUntil?: string | null): string {
  if (!soldOutUntil) return "Sold out";
  const d = new Date(soldOutUntil);
  if (Number.isNaN(d.getTime())) return "Sold out";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Back at ${time}`;
  const date = d.toLocaleDateString([], { month: "short", day: "numeric" });
  return `Back ${date} ${time}`;
}
