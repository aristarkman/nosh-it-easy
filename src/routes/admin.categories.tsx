import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";

export const Route = createFileRoute("/admin/categories")({
  head: () => ({ meta: [{ title: "Menu categories — Admin" }] }),
  component: CategoriesAdmin,
});

type Cat = {
  id: string;
  name: string;
  blurb: string | null;
  sort_order: number;
  active: boolean;
};

function CategoriesAdmin() {
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("menu_categories")
      .select("id,name,blurb,sort_order,active")
      .order("sort_order")
      .order("name");
    if (error) alert(error.message);
    setCats((data ?? []) as Cat[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function addCategory() {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    const next = (cats.at(-1)?.sort_order ?? 0) + 10;
    const { error } = await supabase.from("menu_categories").insert({ name, sort_order: next });
    setAdding(false);
    if (error) { alert(error.message); return; }
    setNewName("");
    load();
  }

  async function updateCategory(id: string, patch: Partial<Cat>) {
    setCats((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c));
    const { error } = await supabase.from("menu_categories").update(patch).eq("id", id);
    if (error) { alert(error.message); load(); }
  }

  async function removeCategory(c: Cat) {
    if (!confirm(`Delete "${c.name}"? Items assigned to this category will fall back to "More from the Deli".`)) return;
    const { error } = await supabase.from("menu_categories").delete().eq("id", c.id);
    if (error) { alert(error.message); return; }
    load();
  }

  async function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= cats.length) return;
    const a = cats[idx];
    const b = cats[j];
    // swap sort_order values
    await Promise.all([
      supabase.from("menu_categories").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase.from("menu_categories").update({ sort_order: a.sort_order }).eq("id", b.id),
    ]);
    load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">Menu categories</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          These are the section headers customers see on the menu page. Assign each menu item to one of these categories on the <strong>Menu items</strong> screen. Anything left unassigned shows under <em>More from the Deli</em>.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addCategory(); }}
            placeholder="New category name (e.g. Specials)"
            className="flex-1 min-w-[200px] rounded border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={addCategory}
            disabled={adding || !newName.trim()}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-50"
          >
            <Plus className="size-3.5" /> Add
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        {loading ? (
          <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : cats.length === 0 ? (
          <div className="p-5 text-sm text-muted-foreground">No categories yet. Add one above.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 w-20">Order</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Blurb (optional)</th>
                <th className="px-4 py-3 w-24">Visible</th>
                <th className="px-4 py-3 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {cats.map((c, idx) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => move(idx, -1)} disabled={idx === 0}
                        className="rounded p-1 hover:bg-muted disabled:opacity-30">
                        <ArrowUp className="size-3.5" />
                      </button>
                      <button onClick={() => move(idx, 1)} disabled={idx === cats.length - 1}
                        className="rounded p-1 hover:bg-muted disabled:opacity-30">
                        <ArrowDown className="size-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      defaultValue={c.name}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== c.name) updateCategory(c.id, { name: v });
                      }}
                      className="w-full rounded border border-border bg-background px-2 py-1 text-sm font-medium"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      defaultValue={c.blurb ?? ""}
                      placeholder="Optional tagline shown next to the category header"
                      onBlur={(e) => {
                        const v = e.target.value.trim() || null;
                        if (v !== c.blurb) updateCategory(c.id, { blurb: v });
                      }}
                      className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => updateCategory(c.id, { active: !c.active })}
                      className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                        c.active ? "bg-green-500/15 text-green-700 dark:text-green-300" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {c.active ? "Visible" : "Hidden"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => removeCategory(c)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Delete category"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
