import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Minus, Plus, Trash2, Sparkles } from "lucide-react";
import { useOrder, fmt, LOCATIONS } from "@/lib/order-context";
import { ITEMS, UPSELLS, getItem } from "@/lib/menu-data";
import { buildLineFromItem } from "@/lib/order-context";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your cart — The Kosher Nosh" },
      { name: "description", content: "Review your order before checkout." },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const { cart, subtotal, removeLine, updateQty, location, orderType, addToCart } = useOrder();
  const loc = LOCATIONS.find((l) => l.id === location);

  if (!cart.length) {
    return (
      <div className="mx-auto max-w-md px-4 pb-16 pt-16 text-center">
        <h1 className="font-display text-4xl font-black">Your cart is empty</h1>
        <p className="mt-2 text-muted-foreground">Let's fix that. Pastrami's calling.</p>
        <Link
          to="/menu"
          className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Browse the menu
        </Link>
      </div>
    );
  }

  const deliveryFee = orderType === "delivery" ? 4.99 : 0;
  const tax = +(subtotal * 0.06625).toFixed(2);
  const total = +(subtotal + deliveryFee + tax).toFixed(2);

  const upsellItems = UPSELLS.map((u) => getItem(u.id))
    .filter((i): i is NonNullable<typeof i> => !!i)
    .filter((i) => !cart.some((l) => l.itemId === i.id));

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-6">
      <Link
        to="/menu"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-4" /> Keep shopping
      </Link>

      <div className="mt-4 flex items-baseline justify-between">
        <h1 className="font-display text-4xl font-black sm:text-5xl">Your cart</h1>
        <div className="text-right text-xs uppercase tracking-widest text-muted-foreground">
          {orderType} · {loc?.name}
        </div>
      </div>

      <ul className="mt-6 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {cart.map((l) => (
          <li key={l.lineId} className="flex gap-4 p-4 sm:p-5">
            <div className="flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-lg font-bold">{l.name}</h3>
                <span className="font-semibold">{fmt(l.unitPrice * l.quantity)}</span>
              </div>
              {l.modifiers.length > 0 && (
                <ul className="mt-1 text-xs text-muted-foreground">
                  {l.modifiers.map((m) => (
                    <li key={m.groupId}>
                      <span className="font-medium text-foreground/70">{m.groupName}:</span>{" "}
                      {m.options.map((o) => o.name).join(", ")}
                    </li>
                  ))}
                </ul>
              )}
              {l.notes && (
                <p className="mt-1 text-xs italic text-muted-foreground">"{l.notes}"</p>
              )}
              <div className="mt-3 flex items-center gap-3">
                <div className="flex items-center rounded-full border border-border">
                  <button
                    onClick={() => updateQty(l.lineId, l.quantity - 1)}
                    className="grid size-8 place-items-center"
                    aria-label="Decrease"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="w-7 text-center text-sm font-semibold">{l.quantity}</span>
                  <button
                    onClick={() => updateQty(l.lineId, l.quantity + 1)}
                    className="grid size-8 place-items-center"
                    aria-label="Increase"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
                <button
                  onClick={() => removeLine(l.lineId)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" /> Remove
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {upsellItems.length > 0 && (
        <section className="mt-8 rounded-2xl border border-dashed border-secondary/50 bg-secondary/5 p-5">
          <div className="flex items-center gap-2 text-secondary">
            <Sparkles className="size-4" />
            <h2 className="text-sm font-bold uppercase tracking-widest">
              People also added
            </h2>
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {upsellItems.map((i) => (
              <li key={i.id}>
                <button
                  onClick={() => addToCart(buildLineFromItem(i, {}, 1))}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-left transition hover:border-primary"
                >
                  <div>
                    <div className="text-sm font-semibold">{i.name}</div>
                    <div className="text-xs text-muted-foreground">{fmt(i.price)}</div>
                  </div>
                  <Plus className="size-4 text-primary" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8 rounded-2xl border border-border bg-card p-5">
        <Row label="Subtotal" value={fmt(subtotal)} />
        {orderType === "delivery" && <Row label="Delivery fee" value={fmt(deliveryFee)} />}
        <Row label="Tax" value={fmt(tax)} />
        <div className="mt-3 border-t border-border pt-3">
          <Row label="Total" value={fmt(total)} bold />
        </div>
        <Link
          to="/checkout"
          className="mt-5 flex items-center justify-center rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Continue to checkout · {fmt(total)}
        </Link>
      </section>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1 text-sm ${bold ? "text-base font-bold" : ""}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
