import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search, Sparkles, Trash2, X } from "lucide-react";
import { toWebP } from "@/lib/image-convert";
import { thumb } from "@/lib/image-url";
import { slugify } from "@/lib/slugify";
import { replacePhotoBackground } from "@/lib/photo-bg.functions";



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
  description: string | null;
  gluten_free_possible: boolean;
  available_locations: string[];
};

type Price = { menu_item_id: string; location_id: string; price: number };
type Loc = { location_id: string; display_name: string | null };
type Group = { id: string; name: string };
type CatRow = { id: string; name: string; sort_order: number };
type Assign = { menu_item_id: string; modifier_group_id: string };
type Photo = { id: string; menu_item_id: string; url: string; sort_order: number };

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
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  async function load() {
    setLoading(true);
    const [i, p, l, g, a, c, ph] = await Promise.all([
      supabase.from("menu_items").select("id,name,category,active,sort_order,photo_url,description,gluten_free_possible,available_locations").order("category").order("sort_order").order("name"),
      supabase.from("menu_item_prices").select("menu_item_id,location_id,price"),
      supabase.from("biyo_locations").select("location_id,display_name").order("location_id"),
      supabase.from("modifier_groups").select("id,name").order("name"),
      supabase.from("menu_item_modifier_groups").select("menu_item_id,modifier_group_id"),
      supabase.from("menu_categories").select("id,name,sort_order").eq("active", true).order("sort_order").order("name"),
      supabase.from("menu_item_photos").select("id,menu_item_id,url,sort_order").order("sort_order"),
    ]);
    setItems((i.data ?? []) as Item[]);
    setPrices((p.data ?? []) as Price[]);
    setLocs((l.data ?? []) as Loc[]);
    setGroups((g.data ?? []) as Group[]);
    setAssigns((a.data ?? []) as Assign[]);
    setCatRows((c.data ?? []) as CatRow[]);
    setPhotos((ph.data ?? []) as Photo[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const cats = useMemo(() => Array.from(new Set(items.map((x) => x.category).filter(Boolean))) as string[], [items]);

  const cresskillHasPriceRow = useMemo(() => {
    const set = new Set<string>();
    for (const p of prices) {
      if (p.location_id === "cresskill") set.add(p.menu_item_id);
    }
    return set;
  }, [prices]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((it) => {
      if (cat && it.category !== cat) return false;
      if (s && !it.name.toLowerCase().includes(s) && !(it.category ?? "").toLowerCase().includes(s)) return false;
      return true;
    });
  }, [items, q, cat]);

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

  async function savePrice(itemId: string, locId: string, raw: string) {
    const trimmed = raw.trim();
    const current = priceFor(itemId, locId);
    // Empty input = remove price row = item not available at this location.
    if (trimmed === "") {
      if (current == null) return;
      const prev = current;
      setPrices((p) => p.filter((x) => !(x.menu_item_id === itemId && x.location_id === locId)));
      const { error } = await supabase.from("menu_item_prices")
        .delete().eq("menu_item_id", itemId).eq("location_id", locId);
      if (error) {
        setPrices((p) => [...p, { menu_item_id: itemId, location_id: locId, price: prev }]);
        alert(error.message);
      }
      return;
    }
    const next = Number(trimmed);
    if (!Number.isFinite(next) || next < 0) { alert("Enter a valid price"); return; }
    const rounded = Math.round(next * 100) / 100;
    if (current != null && Math.abs(current - rounded) < 0.005) return;
    const prev = current;
    setPrices((p) => {
      const without = p.filter((x) => !(x.menu_item_id === itemId && x.location_id === locId));
      return [...without, { menu_item_id: itemId, location_id: locId, price: rounded }];
    });
    const { error } = await supabase.from("menu_item_prices")
      .upsert({ menu_item_id: itemId, location_id: locId, price: rounded }, { onConflict: "menu_item_id,location_id" });
    if (error) {
      setPrices((p) => {
        const without = p.filter((x) => !(x.menu_item_id === itemId && x.location_id === locId));
        return prev == null ? without : [...without, { menu_item_id: itemId, location_id: locId, price: prev }];
      });
      alert(error.message);
    }
  }

  async function bulkCopyPrices(fromLoc: string, toLoc: string) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const rows = prices
      .filter((p) => p.location_id === fromLoc && ids.includes(p.menu_item_id))
      .map((p) => ({ menu_item_id: p.menu_item_id, location_id: toLoc, price: p.price }));
    if (rows.length === 0) { alert(`No ${fromLoc} prices found for the selected items.`); return; }
    if (!window.confirm(`Copy ${rows.length} price${rows.length === 1 ? "" : "s"} from ${fromLoc} to ${toLoc}? This makes the selected items available at ${toLoc}.`)) return;
    setBulkBusy(true);
    const prev = prices;
    setPrices((p) => {
      const without = p.filter((x) => !(x.location_id === toLoc && ids.includes(x.menu_item_id)));
      return [...without, ...rows];
    });
    const { error } = await supabase.from("menu_item_prices")
      .upsert(rows, { onConflict: "menu_item_id,location_id" });
    if (error) { setPrices(prev); alert(error.message); }
    setBulkBusy(false);
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

  async function saveDescription(it: Item, description: string) {
    const trimmed = description.trim();
    const next = trimmed === "" ? null : trimmed;
    if (next === it.description) return;
    const prev = it.description;
    setItems((p) => p.map((x) => x.id === it.id ? { ...x, description: next } : x));
    const { error } = await supabase.from("menu_items").update({ description: next }).eq("id", it.id);
    if (error) {
      setItems((p) => p.map((x) => x.id === it.id ? { ...x, description: prev } : x));
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

  async function toggleGfPossible(it: Item) {
    const next = !it.gluten_free_possible;
    setItems((prev) => prev.map((x) => x.id === it.id ? { ...x, gluten_free_possible: next } : x));
    const { error } = await supabase.from("menu_items").update({ gluten_free_possible: next }).eq("id", it.id);
    if (error) {
      setItems((prev) => prev.map((x) => x.id === it.id ? { ...x, gluten_free_possible: it.gluten_free_possible } : x));
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCat, setBulkCat] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bgJob, setBgJob] = useState<{ done: number; total: number; failed: number; current: string | null } | null>(null);
  const replaceBgFn = useServerFn(replacePhotoBackground);

  async function runMatchBackgrounds() {
    const all = [...photos].sort((a, b) => a.menu_item_id.localeCompare(b.menu_item_id) || a.sort_order - b.sort_order);
    if (all.length === 0) { alert("No photos to process."); return; }
    const ok = window.confirm(
      `Replace the background on ${all.length} menu photo${all.length === 1 ? "" : "s"} with the cream backdrop?\n\n` +
      `This rewrites each photo in place using AI. Originals will be replaced. This can take a few minutes and uses AI credits.`
    );
    if (!ok) return;
    setBgJob({ done: 0, total: all.length, failed: 0, current: null });
    let failed = 0;
    for (let i = 0; i < all.length; i++) {
      const ph = all[i];
      const it = items.find((x) => x.id === ph.menu_item_id);
      setBgJob({ done: i, total: all.length, failed, current: it?.name ?? ph.menu_item_id });
      try {
        const res = await replaceBgFn({ data: { photoId: ph.id } });
        setPhotos((prev) => prev.map((p) => p.id === ph.id ? { ...p, url: res.newUrl } : p));
        if (ph.sort_order === 0) {
          setItems((prev) => prev.map((x) => x.id === ph.menu_item_id ? { ...x, photo_url: res.newUrl } : x));
        }
      } catch (e: any) {
        console.error("Background replace failed for", ph.id, e);
        failed += 1;
      }
    }
    setBgJob({ done: all.length, total: all.length, failed, current: null });
    setTimeout(() => setBgJob(null), 4000);
  }

  function toggleSelect(id: string) {
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function togglePageSelect(on: boolean) {
    setSelected((p) => {
      const n = new Set(p);
      for (const it of paged) { if (on) n.add(it.id); else n.delete(it.id); }
      return n;
    });
  }
  const allPageSelected = paged.length > 0 && paged.every((it) => selected.has(it.id));

  async function bulkDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} item${ids.length === 1 ? "" : "s"}? This removes them from the online menu, prices, availability, and modifier assignments. If they still exist in Biyo, they may return on next sync — disable them there too.`)) return;
    setBulkBusy(true);
    const prevItems = items, prevPrices = prices, prevAssigns = assigns;
    setItems((p) => p.filter((x) => !selected.has(x.id)));
    setPrices((p) => p.filter((x) => !selected.has(x.menu_item_id)));
    setAssigns((p) => p.filter((x) => !selected.has(x.menu_item_id)));
    const [a1, a2, a3, a4] = await Promise.all([
      supabase.from("menu_item_modifier_groups").delete().in("menu_item_id", ids),
      supabase.from("menu_item_prices").delete().in("menu_item_id", ids),
      supabase.from("menu_item_availability").delete().in("menu_item_id", ids),
      supabase.from("menu_item_modifiers").delete().in("menu_item_id", ids),
    ]);
    const childErr = a1.error || a2.error || a3.error || a4.error;
    if (childErr) {
      setItems(prevItems); setPrices(prevPrices); setAssigns(prevAssigns);
      setBulkBusy(false);
      alert(childErr.message);
      return;
    }
    const { error } = await supabase.from("menu_items").delete().in("id", ids);
    if (error) {
      setItems(prevItems); setPrices(prevPrices); setAssigns(prevAssigns);
      alert(error.message);
    } else {
      setSelected(new Set());
    }
    setBulkBusy(false);
  }

  async function bulkRecategorize() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const next = bulkCat || null;
    setBulkBusy(true);
    const prev = items;
    setItems((p) => p.map((x) => selected.has(x.id) ? { ...x, category: next } : x));
    const { error } = await supabase.from("menu_items").update({ category: next }).in("id", ids);
    if (error) {
      setItems(prev);
      alert(error.message);
    } else {
      setSelected(new Set());
      setBulkCat("");
    }
    setBulkBusy(false);
  }

  async function createItem() {
    const name = newName.trim();
    const price = newPrice.trim() === "" ? 0 : Number(newPrice);
    if (!name) { alert("Name is required"); return; }
    if (!Number.isFinite(price) || price < 0) { alert("Enter a valid price"); return; }
    setSaving(true);
    try {
      const biyo_product_id = `manual-${crypto.randomUUID()}`;
      const slug = `${slugify(name)}-${biyo_product_id.slice(-6)}`;
      const { data: ins, error } = await supabase.from("menu_items")
        .insert({ name, category: newCat || null, biyo_product_id, active: true, slug })
        .select("id,name,category,active,sort_order,photo_url,description,gluten_free_possible,available_locations").single();
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
      const converted = await toWebP(file);
      const ext = converted.name.split(".").pop() || "webp";
      const path = `${it.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("menu-photos").upload(path, converted, { upsert: true, contentType: converted.type });
      if (upErr) { alert(upErr.message); return; }
      const { data: pub } = supabase.storage.from("menu-photos").getPublicUrl(path);
      const url = pub.publicUrl;
      const existing = photos.filter((p) => p.menu_item_id === it.id);
      const nextOrder = existing.length === 0 ? 0 : Math.max(...existing.map((p) => p.sort_order)) + 1;
      const { data: ins, error: insErr } = await supabase
        .from("menu_item_photos")
        .insert({ menu_item_id: it.id, url, sort_order: nextOrder })
        .select("id,menu_item_id,url,sort_order")
        .single();
      if (insErr || !ins) { alert(insErr?.message ?? "Failed to save photo"); return; }
      setPhotos((prev) => [...prev, ins as Photo]);
      // Keep menu_items.photo_url in sync with the primary (first) photo
      if (existing.length === 0) {
        await supabase.from("menu_items").update({ photo_url: url }).eq("id", it.id);
        setItems((prev) => prev.map((x) => x.id === it.id ? { ...x, photo_url: url } : x));
      }
    } finally {
      setUploading(null);
    }
  }

  async function deletePhoto(photo: Photo) {
    const prev = photos;
    const next = photos.filter((p) => p.id !== photo.id);
    setPhotos(next);
    const { error } = await supabase.from("menu_item_photos").delete().eq("id", photo.id);
    if (error) { setPhotos(prev); alert(error.message); return; }
    // Update primary photo_url to whatever's now first (or null)
    const remaining = next.filter((p) => p.menu_item_id === photo.menu_item_id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const newPrimary = remaining[0]?.url ?? null;
    await supabase.from("menu_items").update({ photo_url: newPrimary }).eq("id", photo.menu_item_id);
    setItems((prev) => prev.map((x) => x.id === photo.menu_item_id ? { ...x, photo_url: newPrimary } : x));
  }


  async function deleteItem(it: Item) {
    const ok = window.confirm(
      `Delete "${it.name}"? This removes it from the online menu, including its price, availability, and modifier assignments. If this item still exists in Biyo, it may return on the next sync — disable it there too.`
    );
    if (!ok) return;
    const prevItems = items;
    const prevPrices = prices;
    const prevAssigns = assigns;
    setItems((p) => p.filter((x) => x.id !== it.id));
    setPrices((p) => p.filter((x) => x.menu_item_id !== it.id));
    setAssigns((p) => p.filter((x) => x.menu_item_id !== it.id));
    const [a1, a2, a3, a4] = await Promise.all([
      supabase.from("menu_item_modifier_groups").delete().eq("menu_item_id", it.id),
      supabase.from("menu_item_prices").delete().eq("menu_item_id", it.id),
      supabase.from("menu_item_availability").delete().eq("menu_item_id", it.id),
      supabase.from("menu_item_modifiers").delete().eq("menu_item_id", it.id),
    ]);
    const childErr = a1.error || a2.error || a3.error || a4.error;
    if (childErr) {
      setItems(prevItems); setPrices(prevPrices); setAssigns(prevAssigns);
      alert(childErr.message);
      return;
    }
    const { error } = await supabase.from("menu_items").delete().eq("id", it.id);
    if (error) {
      setItems(prevItems); setPrices(prevPrices); setAssigns(prevAssigns);
      alert(error.message);
    }
  }


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Menu items</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            An item is available at a location when it has a price there. Clear a price to hide the item at that location.{" "}
            <Link to="/admin/modifiers" className="text-primary underline">Manage modifications →</Link>
          </p>

        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setCreating((v) => !v)}
            className="rounded border border-primary bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground hover:opacity-90">
            {creating ? "Cancel" : "+ New item"}
          </button>
          <button
            onClick={runMatchBackgrounds}
            disabled={!!bgJob}
            title="Use AI to replace the background of every menu photo with a cream backdrop"
            className="inline-flex items-center gap-1 rounded border border-border px-3 py-1.5 text-sm font-bold hover:border-primary disabled:opacity-50"
          >
            <Sparkles className="size-3.5" />
            {bgJob ? `Matching… ${bgJob.done}/${bgJob.total}` : "Match photo backgrounds"}
          </button>
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

      {bgJob && (
        <div className="rounded-2xl border border-primary/40 bg-card p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">
              Matching backgrounds: {bgJob.done}/{bgJob.total}
              {bgJob.failed > 0 && <span className="ml-2 text-destructive">({bgJob.failed} failed)</span>}
            </span>
            {bgJob.current && <span className="truncate text-muted-foreground">Now: {bgJob.current}</span>}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${(bgJob.done / Math.max(1, bgJob.total)) * 100}%` }} />
          </div>
        </div>
      )}



      {creating && (
        <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-col">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Name</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={120}
              className="w-64 rounded border border-border bg-background px-2 py-1.5 text-sm" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Category</label>
            <select value={newCat} onChange={(e) => setNewCat(e.target.value)}
              className="w-48 rounded border border-border bg-background px-2 py-1.5 text-sm">
              <option value="">— Uncategorized —</option>
              {catRows.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Online price ($)</label>
            <input value={newPrice} onChange={(e) => setNewPrice(e.target.value)} inputMode="decimal" placeholder="0.00"
              className="w-28 rounded border border-border bg-background px-2 py-1.5 text-sm" />
          </div>
          <button onClick={createItem} disabled={saving}
            className="rounded border border-primary bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
            {saving ? "Saving…" : "Create"}
          </button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/40 bg-card p-3 shadow-md">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <button onClick={() => setSelected(new Set())}
            className="rounded border border-border px-2 py-1 text-xs hover:border-primary">Clear</button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select value={bulkCat} onChange={(e) => setBulkCat(e.target.value)}
              className="rounded border border-border bg-background px-2 py-1.5 text-sm">
              <option value="">— Move to category —</option>
              {catRows.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            <button onClick={bulkRecategorize} disabled={bulkBusy}
              className="rounded border border-border px-3 py-1.5 text-sm font-bold hover:border-primary disabled:opacity-50">
              Apply category
            </button>

            <button onClick={() => bulkCopyPrices("cresskill", "glen-rock")} disabled={bulkBusy}
              title="Copy Cresskill prices to Glen Rock for the selected items, making them available at Glen Rock"
              className="rounded border border-border px-3 py-1.5 text-sm font-bold hover:border-primary disabled:opacity-50">
              Copy Cresskill → Glen Rock
            </button>
            <button onClick={() => bulkCopyPrices("glen-rock", "cresskill")} disabled={bulkBusy}
              title="Copy Glen Rock prices to Cresskill for the selected items"
              className="rounded border border-border px-3 py-1.5 text-sm font-bold hover:border-primary disabled:opacity-50">
              Copy Glen Rock → Cresskill
            </button>

            <button onClick={bulkDelete} disabled={bulkBusy}
              className="rounded border border-destructive bg-destructive px-3 py-1.5 text-sm font-bold text-destructive-foreground hover:opacity-90 disabled:opacity-50">
              <Trash2 className="mr-1 inline size-3.5" /> Delete
            </button>
          </div>
        </div>
      )}



      <div className="rounded-2xl border border-border bg-card">
        {loading ? (
          <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-5 text-sm text-muted-foreground">No items. Run a Biyo sync first.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-3">
                  <input type="checkbox" checked={allPageSelected}
                    onChange={(e) => togglePageSelect(e.target.checked)} aria-label="Select all on page" />
                </th>
                <th className="px-4 py-3">Photo</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Menu item</th>
                {locs.map((l) => (
                  <th key={l.location_id} className="px-4 py-3">{(l.display_name ?? l.location_id)} price</th>
                ))}
                <th className="px-4 py-3">Modifications</th>
                <th className="px-4 py-3">GF Possible</th>
                <th className="px-4 py-3">Active</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((it) => (
                <tr key={it.id} className={`border-b border-border last:border-0 ${selected.has(it.id) ? "bg-primary/5" : ""}`}>
                  <td className="px-3 py-3">
                    <input type="checkbox" checked={selected.has(it.id)}
                      onChange={() => toggleSelect(it.id)} aria-label={`Select ${it.name}`} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {photos
                        .filter((p) => p.menu_item_id === it.id)
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((p) => (
                          <div key={p.id} className="group relative size-14 overflow-hidden rounded-lg border border-border bg-muted">
                            <img src={thumb(p.url, 112)} alt="" className="size-full object-cover" />
                            <button
                              type="button"
                              onClick={() => deletePhoto(p)}
                              title="Remove photo"
                              className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-background/90 text-destructive opacity-0 shadow group-hover:opacity-100"
                            >
                              <X className="size-3" />
                            </button>
                          </div>
                        ))}
                      <label className="grid size-14 cursor-pointer place-items-center overflow-hidden rounded-lg border border-dashed border-border bg-muted text-[10px] uppercase tracking-wider text-muted-foreground hover:border-primary hover:text-primary">
                        {uploading === it.id ? "…" : "+ Add"}
                        <input type="file" accept="image/*" className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(it, f); e.target.value = ""; }}
                        />
                      </label>
                    </div>
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
                      className="w-64 rounded border border-transparent bg-transparent px-2 py-1 hover:border-border focus:border-primary focus:bg-background focus:outline-none"
                    />
                    <textarea
                      key={`desc-${it.id}-${it.description ?? ""}`}
                      defaultValue={it.description ?? ""}
                      onBlur={(e) => saveDescription(it, e.target.value)}
                      placeholder="Add description…"
                      rows={2}
                      className="mt-1 w-64 rounded border border-transparent bg-transparent px-2 py-1 text-xs text-muted-foreground hover:border-border focus:border-primary focus:bg-background focus:text-foreground focus:outline-none"
                    />
                  </td>
                  {locs.map((l) => {
                    const cur = priceFor(it.id, l.location_id);
                    return (
                      <td key={l.location_id} className="px-4 py-3 tabular-nums">
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">$</span>
                          <input
                            key={`price-${it.id}-${l.location_id}-${cur ?? ""}`}
                            defaultValue={cur != null ? Number(cur).toFixed(2) : ""}
                            inputMode="decimal"
                            placeholder="0.00"
                            onBlur={(e) => savePrice(it.id, l.location_id, e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            className="w-24 rounded border border-border bg-background px-2 py-1 text-right hover:border-primary focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none"
                          />
                        </div>
                      </td>
                    );
                  })}
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
                      onClick={() => toggleGfPossible(it)}
                      className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                        it.gluten_free_possible ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {it.gluten_free_possible ? "Yes" : "No"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleActive(it)}
                        className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                          it.active ? "bg-green-500/15 text-green-700 dark:text-green-300" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {it.active ? "Active" : "Hidden"}
                      </button>
                      <button
                        onClick={() => deleteItem(it)}
                        title="Delete item"
                        aria-label={`Delete ${it.name}`}
                        className="rounded-full border border-border p-1.5 text-muted-foreground hover:border-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
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
