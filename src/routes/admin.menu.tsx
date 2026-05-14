import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search } from "lucide-react";

export const Route = createFileRoute("/admin/menu")({
  head: () => ({ meta: [{ title: "Menu items — Admin" }] }),
  component: MenuAdmin,
});

type Item = {
  id: string;
  name: string;
  category: string | null;
  active: boolean;
  sort_order: number;
  photo_url: string | null;
};
type Price = { menu_item_id: string; location_id: string; price: number };
type Loc = { location_id: string; display_name: string | null };
type Group = { id: string; name: string };
type CatRow = { id: string; name: string; sort_order: number };
type Assign = { menu_item_id: string; modifier_group_id: string };

function fmt(n: number | undefined) {
  if (n == null) return "—";
  return `$${Number(n).toFixed(2)}`;
}

function MenuAdmin() {
  const [items, setItems] = useState<Item[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [locs, setLocs] = useState<Loc[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [catRows, setCatRows] = useState<CatRow[]>([]);
  const [assigns, setAssigns] = useState<Assign[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  async function load() {
    setLoading(true);
    const [i, p, l, g, a, c] = await Promise.all([
      supabase.from("menu_items").select("id,name,category,active,sort_order,photo_url").order("category").order("sort_order").order("name"),
      supabase.from("menu_item_prices").select("menu_item_id,location_id,price"),
      supabase.from("biyo_locations").select("location_id,display_name").order("location_id"),
      supabase.from("modifier_groups").select("id,name").order("name"),
      supabase.from("menu_item_modifier_groups").select("menu_item_id,modifier_group_id"),
      supabase.from("menu_categories").select("id,name,sort_order").eq("active", true).order("sort_order").order("name"),
    ]);
    setItems((i.data ?? []) as Item[]);
    setPrices((p.data ?? []) as Price[]);
    setLocs(((l.data ?? []) as Loc[]).filter((x) => x.location_id !== "glen-rock"));
    setGroups((g.data ?? []) as Group[]);
    setAssigns((a.data ?? []) as Assign[]);
    setCatRows((c.data ?? []) as CatRow[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const cats = useMemo(() => Array.from(new Set(items.map((x) => x.category).filter(Boolean))) as string[], [items]);

  const cresskillPriced = useMemo(() => {
    const set = new Set<string>();
    for (const p of prices) {
      if (p.location_id === "cresskill" && Number(p.price) > 0) set.add(p.menu_item_id);
    }
    return set;
  }, [prices]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((it) => {
      if (!cresskillPriced.has(it.id)) return false; // hide Glen Rock–only items
      if (cat && it.category !== cat) return false;
      if (s && !it.name.toLowerCase().includes(s) && !(it.category ?? "").toLowerCase().includes(s)) return false;
      return true;
    });
  }, [items, q, cat, cresskillPriced]);

  useEffect(() => { setPage(0); }, [q, cat]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE), [filtered, page]);

  const pricesByItem = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const p of prices) {
      if (!m.has(p.menu_item_id)) m.set(p.menu_item_id, new Map());
      m.get(p.menu_item_id)!.set(p.location_id, p.price);
    }
    return m;
  }, [prices]);

  const assignsByItem = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const a of assigns) {
      if (!m.has(a.menu_item_id)) m.set(a.menu_item_id, new Set());
      m.get(a.menu_item_id)!.add(a.modifier_group_id);
    }
    return m;
  }, [assigns]);

  function priceFor(itemId: string, locId: string) {
    return pricesByItem.get(itemId)?.get(locId);
  }
  function modCount(itemId: string) {
    return assignsByItem.get(itemId)?.size ?? 0;
  }

  async function saveName(it: Item, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === it.name) return;
    const prev = it.name;
    setItems((p) => p.map((x) => x.id === it.id ? { ...x, name: trimmed } : x));
    const { error } = await supabase.from("menu_items").update({ name: trimmed }).eq("id", it.id);
    if (error) {
      setItems((p) => p.map((x) => x.id === it.id ? { ...x, name: prev } : x));
      alert(error.message);
    }
  }

  // online price removed — Cresskill price is the online price

  async function toggleActive(it: Item) {
    // optimistic
    setItems((prev) => prev.map((x) => x.id === it.id ? { ...x, active: !x.active } : x));
    const { error } = await supabase.from("menu_items").update({ active: !it.active }).eq("id", it.id);
    if (error) {
      setItems((prev) => prev.map((x) => x.id === it.id ? { ...x, active: it.active } : x));
      alert(error.message);
    }
  }

  async function toggleAssign(itemId: string, groupId: string, on: boolean) {
    // optimistic
    if (on) {
      setAssigns((p) => [...p, { menu_item_id: itemId, modifier_group_id: groupId }]);
      const { error } = await supabase.from("menu_item_modifier_groups").insert({ menu_item_id: itemId, modifier_group_id: groupId });
      if (error) {
        setAssigns((p) => p.filter((a) => !(a.menu_item_id === itemId && a.modifier_group_id === groupId)));
        alert(error.message);
      }
    } else {
      setAssigns((p) => p.filter((a) => !(a.menu_item_id === itemId && a.modifier_group_id === groupId)));
      const { error } = await supabase.from("menu_item_modifier_groups")
        .delete().eq("menu_item_id", itemId).eq("modifier_group_id", groupId);
      if (error) {
        setAssigns((p) => [...p, { menu_item_id: itemId, modifier_group_id: groupId }]);
        alert(error.message);
      }
    }
  }

  const [editingMods, setEditingMods] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [saving, setSaving] = useState(false);

  async function createItem() {
    const name = newName.trim();
    const price = Number(newPrice);
    if (!name) { alert("Name is required"); return; }
    if (!Number.isFinite(price) || price < 0) { alert("Enter a valid price"); return; }
    setSaving(true);
    try {
      const biyo_product_id = `manual-${crypto.randomUUID()}`;
      const { data: ins, error } = await supabase.from("menu_items")
        .insert({ name, category: newCat || null, biyo_product_id, active: true })
        .select("id,name,category,active,sort_order,photo_url").single();
      if (error || !ins) { alert(error?.message ?? "Failed"); return; }
      const { error: pErr } = await supabase.from("menu_item_prices")
        .insert({ menu_item_id: ins.id, location_id: "cresskill", price });
      if (pErr) { alert(pErr.message); return; }
      setItems((p) => [ins as Item, ...p]);
      setPrices((p) => [...p, { menu_item_id: ins.id, location_id: "cresskill", price }]);
      setNewName(""); setNewCat(""); setNewPrice(""); setCreating(false);
    } finally { setSaving(false); }
  }

  async function uploadPhoto(it: Item, file: File) {
    setUploading(it.id);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${it.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("menu-photos").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) { alert(upErr.message); return; }
      const { data: pub } = supabase.storage.from("menu-photos").getPublicUrl(path);
      const url = pub.publicUrl;
      const { error: dbErr } = await supabase.from("menu_items").update({ photo_url: url }).eq("id", it.id);
      if (dbErr) { alert(dbErr.message); return; }
      setItems((prev) => prev.map((x) => x.id === it.id ? { ...x, photo_url: url } : x));
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Menu items</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Prices come from Biyo. Edit categories, activate items, assign modifications.{" "}
            <Link to="/admin/modifiers" className="text-primary underline">Manage modifications →</Link>
          </p>
        </div>
        <div className="flex gap-2">
          <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded border border-border bg-background px-2 py-1.5 text-sm">
            <option value="">All categories</option>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items…"
              className="rounded border border-border bg-background py-1.5 pl-8 pr-3 text-sm" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        {loading ? (
          <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-5 text-sm text-muted-foreground">No items. Run a Biyo sync first.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Photo</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Menu item</th>
                {locs.map((l) => (
                  <th key={l.location_id} className="px-4 py-3">{(l.display_name ?? l.location_id)} price</th>
                ))}
                <th className="px-4 py-3">Modifications</th>
                <th className="px-4 py-3">Active</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((it) => (
                <tr key={it.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <label className="block size-14 cursor-pointer overflow-hidden rounded-lg border border-border bg-muted hover:border-primary">
                      {it.photo_url ? (
                        <img src={it.photo_url} alt={it.name} className="size-full object-cover" />
                      ) : (
                        <span className="grid size-full place-items-center text-[10px] uppercase tracking-wider text-muted-foreground">
                          {uploading === it.id ? "…" : "Add"}
                        </span>
                      )}
                      <input type="file" accept="image/*" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(it, f); e.target.value = ""; }}
                      />
                    </label>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={it.category ?? ""}
                      onChange={async (e) => {
                        const v = e.target.value || null;
                        if (v === it.category) return;
                        const prev = it.category;
                        setItems((p) => p.map((x) => x.id === it.id ? { ...x, category: v } : x));
                        const { error } = await supabase.from("menu_items").update({ category: v }).eq("id", it.id);
                        if (error) {
                          setItems((p) => p.map((x) => x.id === it.id ? { ...x, category: prev } : x));
                          alert(error.message);
                        }
                      }}
                      className="w-40 rounded border border-border bg-background px-2 py-1 text-xs"
                    >
                      <option value="">— Uncategorized —</option>
                      {catRows.map((c) => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                      {it.category && !catRows.some((c) => c.name === it.category) && (
                        <option value={it.category}>{it.category} (legacy)</option>
                      )}
                    </select>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <input
                      defaultValue={it.name}
                      onBlur={(e) => saveName(it, e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      className="w-56 rounded border border-transparent bg-transparent px-2 py-1 hover:border-border focus:border-primary focus:bg-background focus:outline-none"
                    />
                  </td>
                  {locs.map((l) => (
                    <td key={l.location_id} className="px-4 py-3 tabular-nums text-muted-foreground">
                      {fmt(priceFor(it.id, l.location_id))}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setEditingMods(editingMods === it.id ? null : it.id)}
                      className="rounded-full border border-border px-3 py-1 text-xs font-bold uppercase tracking-wider hover:border-primary"
                    >
                      {modCount(it.id)} assigned
                    </button>
                    {editingMods === it.id && (
                      <div className="mt-2 max-w-xs space-y-1 rounded-lg border border-border bg-background p-2">
                        {groups.length === 0 ? (
                          <div className="text-xs text-muted-foreground">No modifier groups yet. <Link to="/admin/modifiers" className="text-primary underline">Create one</Link></div>
                        ) : groups.map((g) => {
                          const on = assignsByItem.get(it.id)?.has(g.id) ?? false;
                          return (
                            <label key={g.id} className="flex cursor-pointer items-center gap-2 text-xs">
                              <input type="checkbox" checked={on} onChange={(e) => toggleAssign(it.id, g.id, e.target.checked)} />
                              {g.name}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(it)}
                      className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                        it.active ? "bg-green-500/15 text-green-700 dark:text-green-300" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {it.active ? "Active" : "Hidden"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-2 border-t border-border p-3 text-xs text-muted-foreground">
            <span>Showing {page * PAGE_SIZE + 1}–{Math.min(filtered.length, (page + 1) * PAGE_SIZE)} of {filtered.length}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                className="rounded border border-border px-3 py-1 disabled:opacity-40">Prev</button>
              <span className="px-2 py-1">Page {page + 1} / {pageCount}</span>
              <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}
                className="rounded border border-border px-3 py-1 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
