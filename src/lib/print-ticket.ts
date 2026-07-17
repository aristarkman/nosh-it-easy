// Prints a kitchen/order ticket on the tablet's configured thermal printer
// via RawBT (sideloaded on the Fire tablet, pointed at that store's printer
// — MUNBYN P047 at Cresskill, Epson M362B at Glen Rock). RawBT is configured
// once per physical tablet, so this code doesn't need to know which printer
// it's talking to — it just hands ESC/POS bytes to whatever RawBT is set up
// to use on that device.
import { EscPosBuilder } from "./escpos";
import type { CartLine } from "./order-context";

const WIDTH = 42; // characters per line on an 80mm printer at standard font

export type TicketOrder = {
  order_number: string;
  location_id: string;
  order_type: "pickup" | "delivery";
  customer_name: string;
  customer_phone: string;
  delivery_address: string | null;
  when_type: string;
  scheduled_time: string | null;
  items: CartLine[];
  notes: string | null;
  subtotal: number;
  delivery_fee: number;
  tax: number;
  total: number;
};

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function parseTip(notes: string | null): number {
  const match = notes?.match(/(?:^|\|\s*)tip:([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : 0;
}

function formatScheduledTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function buildOrderTicket(order: TicketOrder, locationName: string | undefined): EscPosBuilder {
  const b = new EscPosBuilder();
  b.init();

  b.align("center");
  b.doubleSize(true);
  b.bold(true);
  b.line(locationName ?? order.location_id);
  b.doubleSize(false);
  b.line(`#${order.order_number}`);
  b.bold(false);
  b.align("left");
  b.divider("=", WIDTH);

  b.bold(true);
  b.line(order.order_type === "delivery" ? "DELIVERY" : "PICKUP");
  b.bold(false);

  const when =
    order.when_type === "schedule" && order.scheduled_time
      ? formatScheduledTime(order.scheduled_time)
      : "ASAP";
  b.line(`When: ${when}`);
  b.line(`Customer: ${order.customer_name}`);
  b.line(`Phone: ${order.customer_phone}`);
  if (order.order_type === "delivery" && order.delivery_address) {
    b.line(`Address: ${order.delivery_address}`);
  }
  b.divider("-", WIDTH);

  b.bold(true);
  b.line("ITEMS");
  b.bold(false);
  for (const item of order.items) {
    b.row(`${item.quantity} x ${item.name}`, money(item.unitPrice * item.quantity), WIDTH);
    for (const mod of item.modifiers ?? []) {
      for (const opt of mod.options ?? []) {
        b.line(`   + ${opt.name}`);
      }
    }
    if (item.notes) {
      b.line(`   note: ${item.notes}`);
    }
  }
  b.divider("-", WIDTH);

  b.row("Subtotal", money(order.subtotal), WIDTH);
  if (order.order_type === "delivery" && order.delivery_fee) {
    b.row("Delivery Fee", money(order.delivery_fee), WIDTH);
  }
  b.row("Tax", money(order.tax), WIDTH);
  const tip = parseTip(order.notes);
  if (tip) b.row("Tip", money(tip), WIDTH);
  b.bold(true);
  b.row("TOTAL", money(order.total), WIDTH);
  b.bold(false);

  const orderNotes = (order.notes ?? "")
    .split("|")
    .map((p) => p.trim())
    .filter((p) => p && !/^(tip|promo|loyalty|delivery):/i.test(p) && !p.startsWith("{"));
  if (orderNotes.length) {
    b.divider("-", WIDTH);
    b.bold(true);
    b.line("NOTES");
    b.bold(false);
    orderNotes.forEach((n) => b.line(n));
  }

  b.feed(3);
  b.cut();
  return b;
}

export function printOrderTicket(order: TicketOrder, locationName: string | undefined) {
  const bytes = buildOrderTicket(order, locationName).toBase64();
  // Custom URL scheme — Android/Fire OS resolves this to RawBT without
  // navigating the current page. RawBT sends the raw bytes to whichever
  // printer it's configured with on this device.
  window.location.href = `rawbt:base64,${bytes}`;
}
