import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, Trash2, Search } from "lucide-react";
import { ScrollToTop } from "@/components/scroll-to-top";

export const Route = createFileRoute("/admin/modifiers")({
  head: () => ({ meta: [{ title: "Modifications — Admin" }] }),
  component: ModifiersAdmin,
});

type Group = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  required: boolean;
};
type Option = {
  id: string;
  group_id: string;
  name: string;
  price_delta: number;
  sort_order: number;
};

function ModifiersAdmin() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");

  async function load() {
    setLoading(true);
    const [g, o] = await Promise.all([
      supabase.from("modifier_groups").select("*").order("name"),
      supabase.from("modifier_options").select("*").order("sort_order").order("name"),
    ]);
    setGroups((g.data ?? []) as Group[]);
    setOptions((o.data ?? []) as Option[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function createGroup() {
    const name = newName.trim();
    if (!name) return;
    const { error } = await supabase.from("modifier_groups").insert({ name });
    if (!error) { setNewName(""); load(); }
  }

  async function updateGroup(id: string, patch: Partial<Group>) {
    await supabase.from("modifier_groups").update(patch).eq("id", id);
    setGroups((p) => p.map((g) => g.id === id ? { ...g, ...patch } : g));
  }

  async function deleteGroup(id: string) {
    if (!confirm("Delete this modifier group? It will be removed from all items.")) return;
    await supabase.from("modifier_groups").delete().eq("id", id);
    load();
  }

  async function addOption(group_id: string) {
    const { error } = await supabase.from("modifier_options").insert({ group_id, name: "New option", price_delta: 0 });
    if (!error) load();
  }

  async function updateOption(id: string, patch: Partial<Option>) {
    await supabase.from("modifier_options").update(patch).eq("id", id);
    setOptions((p) => p.map((o) => o.id === id ? { ...o, ...patch } : o));
  }

  async function deleteOption(id: string) {
    await supabase.from("modifier_options").delete().eq("id", id);
    setOptions((p) => p.filter((o) => o.id !== id));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">Modifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reusable option groups (e.g., "Bread choice", "Add-ons"). Assign them to items in{" "}
          <Link to="/admin/menu" className="text-primary underline">Menu items</Link>.
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-bold">New group</h2>
        <div className="mt-3 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Group name (e.g. Bread choice)"
            className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm"
          />
          <button onClick={createGroup} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
            <Plus className="size-4" /> Create
          </button>
        </div>
      </section>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</div>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">No modifier groups yet.</div>
      ) : (
        groups.map((g) => {
          const opts = options.filter((o) => o.group_id === g.id);
          return (
            <section key={g.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <input
                  defaultValue={g.name}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== g.name) updateGroup(g.id, { name: v }); }}
                  className="font-display text-lg font-bold bg-transparent border-b border-transparent focus:border-primary outline-none"
                />
                <button onClick={() => deleteGroup(g.id)} className="text-xs text-destructive hover:underline inline-flex items-center gap-1">
                  <Trash2 className="size-3.5" /> Delete group
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={g.required} onChange={(e) => updateGroup(g.id, { required: e.target.checked })} />
                  Required
                </label>
                <label className="flex items-center gap-2">
                  Min:
                  <input type="number" min={0} value={g.min_select}
                    onChange={(e) => updateGroup(g.id, { min_select: Number(e.target.value) })}
                    className="w-16 rounded border border-border bg-background px-2 py-1" />
                </label>
                <label className="flex items-center gap-2">
                  Max:
                  <input type="number" min={1} value={g.max_select}
                    onChange={(e) => updateGroup(g.id, { max_select: Number(e.target.value) })}
                    className="w-16 rounded border border-border bg-background px-2 py-1" />
                </label>
              </div>

              <div className="mt-4">
                <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Options</div>
                {opts.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No options yet.</div>
                ) : (
                  <ul className="space-y-2">
                    {opts.map((o) => (
                      <li key={o.id} className="flex items-center gap-2">
                        <input
                          defaultValue={o.name}
                          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== o.name) updateOption(o.id, { name: v }); }}
                          className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm"
                        />
                        <span className="text-xs text-muted-foreground">+$</span>
                        <input
                          type="number" step="0.01"
                          defaultValue={o.price_delta}
                          onBlur={(e) => updateOption(o.id, { price_delta: Number(e.target.value) || 0 })}
                          className="w-20 rounded border border-border bg-background px-2 py-1 text-sm tabular-nums"
                        />
                        <button onClick={() => deleteOption(o.id)} className="text-destructive p-1 hover:bg-destructive/10 rounded">
                          <Trash2 className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button onClick={() => addOption(g.id)} className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-wider hover:border-primary">
                  <Plus className="size-3.5" /> Add option
                </button>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
