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
  payment_method: string;
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

function isPaid(paymentMethod: string): boolean {
  // "in-person" means the customer pays at pickup/delivery — everything
  // else (card, applepay, googlepay) is charged via iPOSpays at checkout.
  return paymentMethod !== "in-person";
}

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

  // Bold + slightly-larger (double-height) is now the default for the whole
  // ticket, per Ari. Width stays 1x so the 42-char column math below still
  // lines up — only height increases.
  b.bold(true);
  b.tallText(true);

  b.align("center");
  b.doubleSize(true);
  b.line(locationName ?? order.location_id);
  b.tallText(true);
  b.line(`#${order.order_number}`);
  b.align("left");
  b.divider("=", WIDTH);

  // PAID / NOT PAID — large, reverse-video stamp so it's unmissable.
  b.align("center");
  b.reverse(true);
  b.doubleSize(true);
  if (isPaid(order.payment_method)) {
    b.line(" PAID ");
  } else {
    b.line(" NOT PAID ");
  }
  b.reverse(false);
  b.tallText(true);
  if (!isPaid(order.payment_method)) {
    b.line(`Collect ${money(order.total)} on ${order.order_type}`);
  }
  b.align("left");
  b.divider("=", WIDTH);

  b.line(order.order_type === "delivery" ? "DELIVERY" : "PICKUP");

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

  b.line("ITEMS");
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
  b.row("TOTAL", money(order.total), WIDTH);

  const orderNotes = (order.notes ?? "")
    .split("|")
    .map((p) => p.trim())
    .filter((p) => p && !/^(tip|promo|loyalty|delivery):/i.test(p) && !p.startsWith("{"));
  if (orderNotes.length) {
    b.divider("-", WIDTH);
    b.line("NOTES");
    orderNotes.forEach((n) => b.line(n));
  }

  b.feed(3);
  b.cut();
  return b;
}

export function printOrderTicket(order: TicketOrder, locationName: string | undefined) {
  const bytes = buildOrderTicket(order, locationName).toBase64();
  // Custom URL scheme — Android/Fire OS resolves this to RawBT. This must be
  // a direct top-level navigation: Chromium-based browsers (Silk included)
  // block custom-scheme navigation triggered from hidden iframes as an
  // anti-abuse measure, so that approach silently does nothing.
  window.location.href = `rawbt:base64,${bytes}`;
}
