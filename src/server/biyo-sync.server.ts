// Server-only Biyo helpers. Do NOT import from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BIYO_BASE = "https://koshernosh.biyo.co/api/v1";

export type BiyoProduct = {
  id: number | string;
  name: string;
  price: number | string;
  store?: number | string;
  category?: string | { id: number; name: string } | null;
  description?: string | null;
};

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

// Fetch all products for a Biyo store, walking pagination
export async function fetchBiyoProducts(biyoStoreId: string): Promise<BiyoProduct[]> {
  const all: BiyoProduct[] = [];
  let url: string | null = `/products/?store_id=${encodeURIComponent(biyoStoreId)}&page_size=200`;
  let safety = 0;
  while (url && safety++ < 50) {
    const data: any = await biyoFetch(url);
    const results: BiyoProduct[] = data?.results ?? data ?? [];
    if (Array.isArray(results)) all.push(...results);
    const next: string | null = data?.next ?? null;
    if (!next) break;
    // next may be absolute or relative — strip base if absolute
    url = next.startsWith("http")
      ? next.replace(/^https?:\/\/[^/]+\/api\/v1/, "")
      : next;
  }
  return all;
}

function categoryName(c: BiyoProduct["category"]): string | null {
  if (!c) return null;
  if (typeof c === "string") return c;
  if (typeof c === "object" && "name" in c) return c.name;
  return null;
}

export async function runBiyoSync(): Promise<{
  itemsUpserted: number;
  pricesUpserted: number;
  perLocation: { location_id: string; biyo_store_id: string; count: number }[];
}> {
  const { data: locs, error: lErr } = await supabaseAdmin
    .from("biyo_locations")
    .select("location_id, biyo_store_id");
  if (lErr) throw new Error(`load biyo_locations: ${lErr.message}`);
  if (!locs?.length) throw new Error("No biyo_locations configured");

  // Log start
  const { data: logRow } = await supabaseAdmin
    .from("menu_sync_log")
    .insert({ status: "running" })
    .select("id")
    .single();
  const logId = logRow?.id;

  let itemsUpserted = 0;
  let pricesUpserted = 0;
  const perLocation: { location_id: string; biyo_store_id: string; count: number }[] = [];

  try {
    // Aggregate items across all stores so the menu_items row is created once
    // (price differs per location → menu_item_prices)
    type Aggregate = {
      product: BiyoProduct;
      perStore: Map<string, number>; // biyo_store_id → price
    };
    const byProduct = new Map<string, Aggregate>();

    for (const loc of locs) {
      const products = await fetchBiyoProducts(loc.biyo_store_id);
      perLocation.push({
        location_id: loc.location_id,
        biyo_store_id: loc.biyo_store_id,
        count: products.length,
      });
      for (const p of products) {
        const pid = String(p.id);
        if (!byProduct.has(pid)) byProduct.set(pid, { product: p, perStore: new Map() });
        byProduct.get(pid)!.perStore.set(loc.biyo_store_id, Number(p.price));
      }
    }

    // Upsert menu_items (preserve existing description/category/photo/active/sort)
    const itemsPayload = Array.from(byProduct.values()).map(({ product }) => ({
      biyo_product_id: String(product.id),
      name: product.name,
      // category & description only set on first insert via upsert ignore-on-conflict trick:
      // we use onConflict=biyo_product_id and only update name + last_synced_at
      last_synced_at: new Date().toISOString(),
    }));

    // Two-phase: insert new, update existing (so we don't overwrite admin edits)
    // Get existing ids first
    const biyoIds = itemsPayload.map((i) => i.biyo_product_id);
    const { data: existing } = await supabaseAdmin
      .from("menu_items")
      .select("id, biyo_product_id")
      .in("biyo_product_id", biyoIds);
    const existingMap = new Map((existing ?? []).map((r) => [r.biyo_product_id, r.id]));

    // Insert new items (default category from Biyo, active=false until reviewed)
    const newRows = Array.from(byProduct.values())
      .filter(({ product }) => !existingMap.has(String(product.id)))
      .map(({ product }) => ({
        biyo_product_id: String(product.id),
        name: product.name,
        category: categoryName(product.category),
        description: product.description ?? null,
        active: false,
        last_synced_at: new Date().toISOString(),
      }));
    if (newRows.length) {
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("menu_items")
        .insert(newRows)
        .select("id, biyo_product_id");
      if (insErr) throw new Error(`insert menu_items: ${insErr.message}`);
      for (const r of inserted ?? []) existingMap.set(r.biyo_product_id, r.id);
      itemsUpserted += inserted?.length ?? 0;
    }

    // Update name + last_synced_at for existing items (preserves admin enrichments)
    for (const { product } of byProduct.values()) {
      const id = existingMap.get(String(product.id));
      if (!id) continue;
      const { error: upErr } = await supabaseAdmin
        .from("menu_items")
        .update({ name: product.name, last_synced_at: new Date().toISOString() })
        .eq("id", id);
      if (!upErr) itemsUpserted += 1;
    }

    // Build location_id → biyo_store_id reverse map
    const storeToLoc = new Map(locs.map((l) => [l.biyo_store_id, l.location_id]));

    // Upsert prices per (item, location)
    const pricesPayload: {
      menu_item_id: string;
      location_id: string;
      price: number;
      synced_at: string;
    }[] = [];
    for (const [pid, agg] of byProduct.entries()) {
      const itemId = existingMap.get(pid);
      if (!itemId) continue;
      for (const [storeId, price] of agg.perStore.entries()) {
        const locId = storeToLoc.get(storeId);
        if (!locId) continue;
        pricesPayload.push({
          menu_item_id: itemId,
          location_id: locId,
          price: Number(price) || 0,
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

    return { itemsUpserted, pricesUpserted, perLocation };
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
