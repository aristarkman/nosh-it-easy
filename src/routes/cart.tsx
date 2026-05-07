import { createFileRoute, Link, useServerFn } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Minus, Plus, Trash2, Star } from "lucide-react";
import { useOrder, fmt, LOCATIONS } from "@/lib/order-context";
import { getMenu } from "@/lib/menu.functions";
import type { MenuItem } from "@/lib/menu-types";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your cart — The Famous Kosher Nosh" },
      { name: "description", content: "Review your order before checkout." },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const { cart, subtotal, removeLine, updateQty, location, orderType } = useOrder();
  const loc = LOCATIONS.find((l) => l.id === location);
  const [authed, setAuthed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setAuthed(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const saveAsFavorite = async () => {
    if (!location || !orderType || cart.length === 0) return;
    const name = window.prompt("Name this favorite (e.g. \"My usual\")", "My usual");
    if (!name) return;
    setSaving(true);
    const { data: sess } = await supabase.auth.getSession();
    const userId = sess.session?.user.id;
    if (!userId) {
      setSaving(false);
      toast.error("Please sign in to save favorites");
      return;
    }
    const { error } = await supabase.from("customer_favorites").insert({
      user_id: userId,
      name: name.trim().slice(0, 60),
      location_id: location,
      order_type: orderType,
      items: cart as unknown as never,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Saved to favorites");
  };

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
        {authed ? (
          <button
            onClick={saveAsFavorite}
            disabled={saving}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-border bg-card px-5 py-2.5 text-xs font-semibold uppercase tracking-wider hover:border-primary disabled:opacity-50"
          >
            <Star className="size-3.5 text-primary" />
            {saving ? "Saving…" : "Save cart as favorite"}
          </button>
        ) : (
          <Link
            to="/login"
            className="mt-2 block text-center text-xs text-muted-foreground hover:text-primary"
          >
            Sign in to save this as a favorite
          </Link>
        )}
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
