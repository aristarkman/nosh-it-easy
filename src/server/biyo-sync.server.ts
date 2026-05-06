// Server-only Biyo helpers. Do NOT import from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BIYO_BASE = "https://koshernosh.biyo.co/api/v1";

type BiyoCategory = { id: number; name: string; active?: boolean; archived?: boolean };
type BiyoStoreInfo = { store_id: number | string; enabled?: boolean; price?: number | null };
export type BiyoProduct = {
  id: number | string;
  name: string;
  price: number | string | null;
  description?: string | null;
  image?: string | null;
  archived?: boolean;
  categories?: BiyoCategory[] | null;
  store_stock_info?: BiyoStoreInfo[] | null;
};

type BiyoModifierGroup = { id: number; name: string };
type BiyoModifier = { id: number; name: string; price: number | string; group: number[] };

async function biyoFetch(path: string): Promise<any> {
  const token = process.env.BIYO_API_KEY;
  if (!token) throw new Error("BIYO_API_KEY is not configured");
  const res = await fetch(`${BIYO_BASE}${path}`, {
    headers: {
      Authorization: token,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Biyo ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Biyo ${path}: invalid JSON`);
  }
}

async function biyoFetchAll<T = any>(startPath: string): Promise<T[]> {
  const all: T[] = [];
  let url: string | null = startPath;
  let safety = 0;
  while (url && safety++ < 100) {
    const data: any = await biyoFetch(url);
    const results: T[] = data?.results ?? data ?? [];
    if (Array.isArray(results)) all.push(...results);
    const next: string | null = data?.next ?? null;
    if (!next) break;
    url = next.startsWith("http")
      ? next.replace(/^https?:\/\/[^/]+\/api\/v1/, "")
      : next;
  }
  return all;
}

export async function fetchBiyoProducts(): Promise<BiyoProduct[]> {
  return biyoFetchAll<BiyoProduct>("/products/?page_size=200");
}

function pickCategory(cats: BiyoCategory[] | null | undefined): string | null {
  if (!cats?.length) return null;
  const live = cats.find((c) => !c.archived);
  return (live ?? cats[0]).name ?? null;
}

function isJunkProduct(p: BiyoProduct): boolean {
  // Negative IDs (Gift Card, Points Redeemed, etc.)
  if (Number(p.id) < 0) return true;
  if (p.archived) return true;
  // All categories archived → likely retired item
  if (p.categories?.length && p.categories.every((c) => c.archived)) return true;
  // Disabled at every store
  const ssi = p.store_stock_info ?? [];
  if (ssi.length && ssi.every((s) => s.enabled === false)) return true;
  return false;
}

function priceForStore(p: BiyoProduct, storeId: string): number {
  const ssi = (p.store_stock_info ?? []).find((s) => String(s.store_id) === String(storeId));
  if (ssi && ssi.price != null && Number(ssi.price) > 0) return Number(ssi.price);
  return Number(p.price) || 0;
}

function storeEnabled(p: BiyoProduct, storeId: string): boolean {
  const ssi = (p.store_stock_info ?? []).find((s) => String(s.store_id) === String(storeId));
  return ssi ? ssi.enabled !== false : true;
}

export async function runBiyoSync(): Promise<{
  itemsUpserted: number;
  pricesUpserted: number;
  modifierGroupsUpserted: number;
  modifierOptionsUpserted: number;
  skipped: number;
  perLocation: { location_id: string; biyo_store_id: string; count: number }[];
}> {
  const { data: locs, error: lErr } = await supabaseAdmin
    .from("biyo_locations")
    .select("location_id, biyo_store_id");
  if (lErr) throw new Error(`load biyo_locations: ${lErr.message}`);
  if (!locs?.length) throw new Error("No biyo_locations configured");

  const { data: logRow } = await supabaseAdmin
    .from("menu_sync_log")
    .insert({ status: "running" })
    .select("id")
    .single();
  const logId = logRow?.id;

  let itemsUpserted = 0;
  let pricesUpserted = 0;
  let modifierGroupsUpserted = 0;
  let modifierOptionsUpserted = 0;
  let skipped = 0;
  const perLocation: { location_id: string; biyo_store_id: string; count: number }[] = [];

  try {
    // 1. Sync modifier groups + options (global, not per-store)
    const [biyoGroups, biyoMods] = await Promise.all([
      biyoFetchAll<BiyoModifierGroup>("/modifier_groups/?page_size=200"),
      biyoFetchAll<BiyoModifier>("/modifiers/?page_size=200"),
    ]);

    // Map biyo group id → our uuid. Match by name (case-insensitive trimmed).
    const { data: existingGroups } = await supabaseAdmin
      .from("modifier_groups")
      .select("id, name");
    const groupByName = new Map<string, string>();
    for (const g of existingGroups ?? []) groupByName.set(g.name.trim().toLowerCase(), g.id);

    const biyoGroupIdToUuid = new Map<number, string>();
    for (const g of biyoGroups) {
      const key = g.name.trim().toLowerCase();
      let uuid = groupByName.get(key);
      if (!uuid) {
        const { data: ins, error } = await supabaseAdmin
          .from("modifier_groups")
          .insert({ name: g.name })
          .select("id")
          .single();
        if (error || !ins) continue;
        uuid = ins.id;
        groupByName.set(key, uuid);
        modifierGroupsUpserted++;
      }
      biyoGroupIdToUuid.set(g.id, uuid);
    }

    // Sync options. Match by (group_uuid, name). Insert if missing; update price if changed.
    const groupUuids = Array.from(new Set(Array.from(biyoGroupIdToUuid.values())));
    const { data: existingOpts } = await supabaseAdmin
      .from("modifier_options")
      .select("id, group_id, name, price_delta")
      .in("group_id", groupUuids.length ? groupUuids : ["00000000-0000-0000-0000-000000000000"]);
    const optKey = (gid: string, name: string) => `${gid}::${name.trim().toLowerCase()}`;
    const optMap = new Map<string, { id: string; price_delta: number }>();
    for (const o of existingOpts ?? []) {
      optMap.set(optKey(o.group_id, o.name), { id: o.id, price_delta: Number(o.price_delta) });
    }

    for (const m of biyoMods) {
      for (const biyoGid of m.group ?? []) {
        const uuid = biyoGroupIdToUuid.get(biyoGid);
        if (!uuid) continue;
        const price = Number(m.price) || 0;
        const key = optKey(uuid, m.name);
        const ex = optMap.get(key);
        if (!ex) {
          const { error } = await supabaseAdmin
            .from("modifier_options")
            .insert({ group_id: uuid, name: m.name, price_delta: price });
          if (!error) modifierOptionsUpserted++;
        } else if (Math.abs(ex.price_delta - price) > 0.001) {
          const { error } = await supabaseAdmin
            .from("modifier_options")
            .update({ price_delta: price })
            .eq("id", ex.id);
          if (!error) modifierOptionsUpserted++;
        }
      }
    }

    // 2. Sync products (single fetch — products are global; per-store info embedded)
    const allProducts = await fetchBiyoProducts();
    const products = allProducts.filter((p) => {
      if (isJunkProduct(p)) { skipped++; return false; }
      return true;
    });

    // For perLocation summary, count per store
    for (const loc of locs) {
      const count = products.filter((p) => storeEnabled(p, loc.biyo_store_id)).length;
      perLocation.push({ location_id: loc.location_id, biyo_store_id: loc.biyo_store_id, count });
    }

    // Upsert menu_items: insert new, update name + category for existing.
    const biyoIds = products.map((p) => String(p.id));
    const { data: existing } = await supabaseAdmin
      .from("menu_items")
      .select("id, biyo_product_id, category")
      .in("biyo_product_id", biyoIds);
    const existingMap = new Map((existing ?? []).map((r) => [r.biyo_product_id, r]));

    const newRows = products
      .filter((p) => !existingMap.has(String(p.id)))
      .map((p) => ({
        biyo_product_id: String(p.id),
        name: p.name,
        category: pickCategory(p.categories),
        description: p.description ?? null,
        photo_url: p.image ?? null,
        active: false,
        last_synced_at: new Date().toISOString(),
      }));
    if (newRows.length) {
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("menu_items")
        .insert(newRows)
        .select("id, biyo_product_id");
      if (insErr) throw new Error(`insert menu_items: ${insErr.message}`);
      for (const r of inserted ?? []) existingMap.set(r.biyo_product_id, { id: r.id, biyo_product_id: r.biyo_product_id, category: null });
      itemsUpserted += inserted?.length ?? 0;
    }

    // Update name + category (only if admin hasn't set one) + last_synced_at
    for (const p of products) {
      const ex = existingMap.get(String(p.id));
      if (!ex) continue;
      const update: { name: string; last_synced_at: string; category?: string } = {
        name: p.name,
        last_synced_at: new Date().toISOString(),
      };
      if (!ex.category) {
        const cat = pickCategory(p.categories);
        if (cat) update.category = cat;
      }
      const { error: upErr } = await supabaseAdmin
        .from("menu_items")
        .update(update)
        .eq("id", ex.id);
      if (!upErr) itemsUpserted += 1;
    }

    // 3. Prices per (item, location). Skip items disabled at that store.
    const pricesPayload: { menu_item_id: string; location_id: string; price: number; synced_at: string }[] = [];
    for (const p of products) {
      const ex = existingMap.get(String(p.id));
      if (!ex) continue;
      for (const loc of locs) {
        if (!storeEnabled(p, loc.biyo_store_id)) continue;
        pricesPayload.push({
          menu_item_id: ex.id,
          location_id: loc.location_id,
          price: priceForStore(p, loc.biyo_store_id),
          synced_at: new Date().toISOString(),
        });
      }
    }
    if (pricesPayload.length) {
      const { error: pErr, count } = await supabaseAdmin
        .from("menu_item_prices")
        .upsert(pricesPayload, { onConflict: "menu_item_id,location_id", count: "exact" });
      if (pErr) throw new Error(`upsert prices: ${pErr.message}`);
      pricesUpserted = count ?? pricesPayload.length;
    }

    if (logId) {
      await supabaseAdmin
        .from("menu_sync_log")
        .update({
          finished_at: new Date().toISOString(),
          status: "success",
          items_upserted: itemsUpserted,
          prices_upserted: pricesUpserted,
        })
        .eq("id", logId);
    }

    return { itemsUpserted, pricesUpserted, modifierGroupsUpserted, modifierOptionsUpserted, skipped, perLocation };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (logId) {
      await supabaseAdmin
        .from("menu_sync_log")
        .update({ finished_at: new Date().toISOString(), status: "failed", error: msg })
        .eq("id", logId);
    }
    throw err;
  }
}
