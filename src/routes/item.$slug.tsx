import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Minus, Plus } from "lucide-react";
import type { MenuItem, ModifierGroup, ModifierOption } from "@/lib/menu-types";
import { useOrder, fmt, buildLineFromItem } from "@/lib/order-context";
import { menuItemAlt } from "@/lib/alt-text";
import { getMenuItem } from "@/lib/menu.functions";
import { thumb } from "@/lib/image-url";
import { z } from "zod";

export const Route = createFileRoute("/item/$slug")({
  validateSearch: z.object({ edit: z.string().optional() }),
  loader: async ({ params }) => {
    const { item } = await getMenuItem({ data: { slug: params.slug } });
    if (!item) throw notFound();
    return { item };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.item.name ?? "Item"} — The Kosher Nosh` },
      { name: "description", content: loaderData?.item.description ?? "" },
    ],
  }),
  notFoundComponent: () => (
    <div className="mx-auto max-w-md p-10 text-center">
      <h1 className="font-display text-3xl font-black">Item not found</h1>
      <Link to="/menu" className="mt-4 inline-block text-primary underline">
        Back to menu
      </Link>
    </div>
  ),
  errorComponent: () => (
    <div className="mx-auto max-w-md p-10 text-center">
      <p>Something went wrong loading this item.</p>
      <Link to="/menu" className="mt-4 inline-block text-primary underline">
        Back to menu
      </Link>
    </div>
  ),
  component: ItemPage,
});

function ModifierSection({
  g,
  selections,
  toggle,
}: {
  g: ModifierGroup;
  selections: Record<string, ModifierOption[]>;
  toggle: (g: ModifierGroup, o: ModifierOption) => void;
}) {
  const selected = selections[g.id] ?? [];
  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-bold">{g.name}</h2>
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {g.required ? "Required" : "Optional"}
          {g.max > 1 && ` · pick up to ${g.max}`}
        </span>
      </div>
      <div className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {g.options.map((o) => {
          const isSelected = !!selected.find((x) => x.id === o.id);
          return (
            <button
              key={o.id}
              onClick={() => toggle(g, o)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-muted/40"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-${
                    g.max === 1 ? "full" : "md"
                  } border-2 ${
                    isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border"
                  }`}
                >
                  {isSelected && (
                    <span className={`block ${g.max === 1 ? "size-2 rounded-full bg-primary-foreground" : "text-[11px] font-black"}`}>
                      {g.max === 1 ? "" : "✓"}
                    </span>
                  )}
                </span>
                <span className="font-medium">{o.name}</span>
              </div>
              {o.price ? (
                <span className="text-sm text-muted-foreground">+{fmt(o.price)}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ItemPage() {
  const { item } = Route.useLoaderData() as { item: MenuItem };
  const { edit: editLineId } = Route.useSearch();
  const { addToCart, replaceLine, cart, location } = useOrder();
  const navigate = useNavigate();

  const editingLine = editLineId ? cart.find((l) => l.lineId === editLineId) : undefined;
  const isEditing = !!editingLine && editingLine.itemId === item.id;

  const [selections, setSelections] = useState<Record<string, ModifierOption[]>>(() => {
    const init: Record<string, ModifierOption[]> = {};
    item.modifierGroups?.forEach((g) => {
      if (isEditing) {
        const existing = editingLine!.modifiers.find((m) => m.groupId === g.id);
        init[g.id] = existing ? existing.options : [];
      } else if (g.required && g.max === 1 && g.options[0]) {
        init[g.id] = [g.options[0]];
      } else {
        init[g.id] = [];
      }
    });
    return init;
  });
  const [qty, setQty] = useState(isEditing ? editingLine!.quantity : 1);
  const [notes, setNotes] = useState(isEditing ? editingLine!.notes ?? "" : "");
  const photos = item.images && item.images.length > 0 ? item.images : (item.image ? [item.image] : []);
  const [activePhoto, setActivePhoto] = useState(0);

  const toggle = (g: ModifierGroup, o: ModifierOption) => {
    setSelections((prev) => {
      const cur = prev[g.id] ?? [];
      const has = cur.find((x) => x.id === o.id);
      let next: ModifierOption[];
      if (g.max === 1) next = has ? (g.required ? cur : []) : [o];
      else if (has) next = cur.filter((x) => x.id !== o.id);
      else if (cur.length >= g.max) next = [...cur.slice(1), o];
      else next = [...cur, o];
      return { ...prev, [g.id]: next };
    });
  };

  const modPrice = Object.values(selections).reduce(
    (s, opts) => s + opts.reduce((a, o) => a + (o.price ?? 0), 0),
    0
  );
  const unit = item.price + modPrice;
  const valid = (item.modifierGroups ?? []).every(
    (g) => !g.required || (selections[g.id]?.length ?? 0) >= Math.max(1, g.min)
  );

  const add = () => {
    const line = buildLineFromItem(item, selections, qty, notes.trim() || undefined);
    if (isEditing) replaceLine(editingLine!.lineId, line);
    else addToCart(line);
    navigate({ to: "/cart" });
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pb-32 pt-6">
      <Link
        to="/menu"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-4" /> Back to menu
      </Link>

      <div className="mt-4 grid gap-6 md:grid-cols-2">
        {photos.length > 0 && (
          <div className="md:mb-0">
            <div className="overflow-hidden rounded-2xl border border-border bg-muted">
              <img
                src={thumb(photos[activePhoto], 1024, 80)}
                alt={menuItemAlt(item.name, location)}
                className="aspect-square w-full object-cover"
              />
            </div>
            {photos.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {photos.map((p, i) => (
                  <button
                    key={p + i}
                    onClick={() => setActivePhoto(i)}
                    className={`size-16 shrink-0 overflow-hidden rounded-lg border-2 ${
                      i === activePhoto ? "border-primary" : "border-border"
                    }`}
                    aria-label={`Photo ${i + 1}`}
                  >
                    <img src={thumb(p, 160)} alt={`${menuItemAlt(item.name, location)} - photo ${i + 1}`} className="size-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className={photos.length > 0 ? "" : "md:col-span-2"}>
          <h1 className="font-display text-4xl font-black sm:text-5xl">{item.name}</h1>
          <p className="mt-2 text-muted-foreground">{item.description}</p>
          <div className="mt-3 text-lg font-semibold">{fmt(item.price)}</div>
        </div>
      </div>

      {item.modifierGroups && item.modifierGroups.length > 1 ? (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {item.modifierGroups.map((g) => (
            <ModifierSection key={g.id} g={g} selections={selections} toggle={toggle} />
          ))}
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {item.modifierGroups?.map((g) => (
            <ModifierSection key={g.id} g={g} selections={selections} toggle={toggle} />
          ))}
        </div>
      )}

      <section className="mt-8">
        <h2 className="font-display text-xl font-bold">Special instructions</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={250}
          rows={3}
          placeholder="Allergies, prep notes, extra mustard…"
          className="mt-2 w-full rounded-xl border border-border bg-card p-3 text-sm outline-none focus:border-primary"
        />
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="flex items-center rounded-full border border-border bg-card">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="grid size-10 place-items-center text-foreground"
              aria-label="Decrease quantity"
            >
              <Minus className="size-4" />
            </button>
            <span className="w-8 text-center font-semibold">{qty}</span>
            <button
              onClick={() => setQty((q) => q + 1)}
              className="grid size-10 place-items-center text-foreground"
              aria-label="Increase quantity"
            >
              <Plus className="size-4" />
            </button>
          </div>
          <button
            disabled={!valid}
            onClick={add}
            className="flex flex-1 items-center justify-between rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
          >
            <span>{isEditing ? `Update ${qty} in cart` : `Add ${qty} to cart`}</span>
            <span>{fmt(unit * qty)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
