import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/menu-order")({
  head: () => ({ meta: [{ title: "Menu order — Admin" }] }),
  component: MenuOrderAdmin,
});

type Category = { id: string; name: string; sort_order: number };
type Item = {
  id: string;
  name: string;
  category: string | null;
  sort_order: number;
  active: boolean;
  photo_url: string | null;
};

function MenuOrderAdmin() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: categoryRows, error: categoryError }, { data: itemRows, error: itemError }] =
      await Promise.all([
        supabase
          .from("menu_categories")
          .select("id,name,sort_order")
          .eq("active", true)
          .order("sort_order")
          .order("name"),
        supabase
          .from("menu_items")
          .select("id,name,category,sort_order,active,photo_url")
          .order("category")
          .order("sort_order")
          .order("name"),
      ]);

    if (categoryError || itemError) {
      toast.error(categoryError?.message || itemError?.message || "Could not load menu order");
    }

    const nextCategories = (categoryRows ?? []) as Category[];
    setCategories(nextCategories);
    setItems((itemRows ?? []) as Item[]);
    setCategory((current) => current || nextCategories[0]?.name || "");
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const orderedItems = useMemo(
    () =>
      items
        .filter((item) => item.category === category)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [items, category]
  );

  async function persistOrder(nextOrder: Item[]) {
    const previousItems = items;
    const positions = new Map(nextOrder.map((item, index) => [item.id, index]));
    setItems((current) =>
      current.map((item) =>
        positions.has(item.id) ? { ...item, sort_order: positions.get(item.id)! } : item
      )
    );
    setSaving(true);

    const results = await Promise.all(
      nextOrder.map((item, index) =>
        supabase.from("menu_items").update({ sort_order: index }).eq("id", item.id)
      )
    );
    const failed = results.find((result) => result.error);
    setSaving(false);

    if (failed?.error) {
      setItems(previousItems);
      toast.error(failed.error.message || "Could not save menu order");
      return;
    }

    toast.success("Menu order saved");
  }

  function move(itemId: string, direction: "up" | "down" | "top" | "bottom") {
    if (saving) return;
    const next = [...orderedItems];
    const index = next.findIndex((item) => item.id === itemId);
    if (index < 0) return;

    const [item] = next.splice(index, 1);
    const target =
      direction === "top"
        ? 0
        : direction === "bottom"
          ? next.length
          : direction === "up"
            ? Math.max(0, index - 1)
            : Math.min(next.length, index + 1);
    next.splice(target, 0, item);
    void persistOrder(next);
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Menu management</div>
        <h2 className="font-display text-3xl">Reorder menu items</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a category, then move items into the order customers should see.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <label className="text-sm font-semibold" htmlFor="menu-order-category">
          Category
        </label>
        <select
          id="menu-order-category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="min-w-64 rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          {categories.map((row) => (
            <option key={row.id} value={row.name}>
              {row.name}
            </option>
          ))}
        </select>
        {saving && (
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Saving…
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? (
          <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : orderedItems.length === 0 ? (
          <div className="p-5 text-sm text-muted-foreground">No items in this category.</div>
        ) : (
          <div className="divide-y divide-border">
            {orderedItems.map((item, index) => (
              <div key={item.id} className="flex items-center gap-3 p-3 sm:p-4">
                <div className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-sm font-bold">
                  {index + 1}
                </div>
                {item.photo_url ? (
                  <img src={item.photo_url} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="size-14 shrink-0 rounded-lg bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{item.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.active ? "Active" : "Hidden"}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <MoveButton
                    label="Move to top"
                    disabled={saving || index === 0}
                    onClick={() => move(item.id, "top")}
                  >
                    <ChevronsUp className="size-4" />
                  </MoveButton>
                  <MoveButton
                    label="Move up"
                    disabled={saving || index === 0}
                    onClick={() => move(item.id, "up")}
                  >
                    <ArrowUp className="size-4" />
                  </MoveButton>
                  <MoveButton
                    label="Move down"
                    disabled={saving || index === orderedItems.length - 1}
                    onClick={() => move(item.id, "down")}
                  >
                    <ArrowDown className="size-4" />
                  </MoveButton>
                  <MoveButton
                    label="Move to bottom"
                    disabled={saving || index === orderedItems.length - 1}
                    onClick={() => move(item.id, "bottom")}
                  >
                    <ChevronsDown className="size-4" />
                  </MoveButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MoveButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-lg border border-border bg-background hover:border-primary disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}
