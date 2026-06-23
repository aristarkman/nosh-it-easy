import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { MenuItem, ModifierGroup, ModifierOption, Category } from "@/lib/menu-types";

const PRICE_LOCATION = "cresskill"; // single source of truth for prices
const FALLBACK_CATEGORY = "More from the Deli";

async function buildMenu(): Promise<{ items: MenuItem[]; categories: Category[] }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [itemsRes, pricesRes, availRes, migRes, mgRes, moRes, catsRes, photosRes] = await Promise.all([
    supabaseAdmin
      .from("menu_items")
      .select("id,name,description,category,popular,photo_url,sort_order")
      .eq("active", true)
      .order("sort_order")
      .order("name"),
    supabaseAdmin
      .from("menu_item_prices")
      .select("menu_item_id,price")
      .eq("location_id", PRICE_LOCATION),
    supabaseAdmin
      .from("menu_item_availability")
      .select("menu_item_id,sold_out")
      .eq("location_id", PRICE_LOCATION)
      .eq("sold_out", true),
    supabaseAdmin.from("menu_item_modifier_groups").select("menu_item_id,modifier_group_id,sort_order"),
    supabaseAdmin.from("modifier_groups").select("id,name,required,min_select,max_select"),
    supabaseAdmin.from("modifier_options").select("id,group_id,name,price_delta,sort_order").order("sort_order"),
    supabaseAdmin.from("menu_categories").select("id,name,blurb,sort_order").eq("active", true).order("sort_order").order("name"),
    supabaseAdmin.from("menu_item_photos").select("menu_item_id,url,sort_order").order("sort_order"),
  ]);

  if (itemsRes.error) throw itemsRes.error;
  if (pricesRes.error) throw pricesRes.error;

  const priceById = new Map<string, number>();
  for (const p of pricesRes.data ?? []) priceById.set(p.menu_item_id, Number(p.price));

  const soldOut = new Set<string>((availRes.data ?? []).map((r) => r.menu_item_id));

  const optsByGroup = new Map<string, ModifierOption[]>();
  for (const o of moRes.data ?? []) {
    const arr = optsByGroup.get(o.group_id) ?? [];
    arr.push({ id: o.id, name: o.name, price: Number(o.price_delta) || undefined });
    optsByGroup.set(o.group_id, arr);
  }

  const groupById = new Map<string, ModifierGroup>();
  for (const g of mgRes.data ?? []) {
    groupById.set(g.id, {
      id: g.id,
      name: g.name,
      required: g.required,
      min: g.min_select,
      max: g.max_select,
      options: optsByGroup.get(g.id) ?? [],
    });
  }

  const groupsByItem = new Map<string, ModifierGroup[]>();
  const sortedAssigns = [...(migRes.data ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  for (const a of sortedAssigns) {
    const g = groupById.get(a.modifier_group_id);
    if (!g) continue;
    const arr = groupsByItem.get(a.menu_item_id) ?? [];
    arr.push(g);
    groupsByItem.set(a.menu_item_id, arr);
  }

  // Build category list strictly from admin-defined categories.
  // Items whose category does not match an admin category are hidden.
  const categories: Category[] = (catsRes.data ?? []).map((c) => ({
    id: c.name, // use name as the id since menu_items.category is free text
    name: c.name,
    blurb: c.blurb ?? undefined,
  }));
  const validCatNames = new Set(categories.map((c) => c.name));

  const photosByItem = new Map<string, string[]>();
  for (const ph of photosRes.data ?? []) {
    const arr = photosByItem.get(ph.menu_item_id) ?? [];
    arr.push(ph.url);
    photosByItem.set(ph.menu_item_id, arr);
  }

  const items: MenuItem[] = [];
  for (const it of itemsRes.data ?? []) {
    const price = priceById.get(it.id);
    if (price == null || price < 0) continue; // skip items with no price row
    const itemGroups = groupsByItem.get(it.id) ?? [];
    // Allow $0 base only if a modifier group provides pricing
    if (price === 0) {
      const hasPricedModifier = itemGroups.some((g) => g.options.some((o) => (o.price ?? 0) > 0));
      if (!hasPricedModifier) continue;
    }
    const raw = (it.category ?? "").trim();
    if (!validCatNames.has(raw)) continue; // hide items whose category isn't in admin Categories
    const cat = raw;
    const photos = photosByItem.get(it.id) ?? [];
    const primary = photos[0] ?? it.photo_url ?? undefined;
    items.push({
      id: it.id,
      name: it.name,
      description: it.description ?? "",
      price,
      category: cat,
      rawCategory: it.category,
      image: primary,
      images: photos.length > 0 ? photos : (it.photo_url ? [it.photo_url] : []),
      popular: !!it.popular,
      soldOut: soldOut.has(it.id),
      modifierGroups: groupsByItem.get(it.id) ?? [],
    });
  }
  return { items, categories };
}

export const getMenu = createServerFn({ method: "GET" }).handler(async () => {
  return await buildMenu();
});

export const getMenuItem = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { items } = await buildMenu();
    const item = items.find((i) => i.id === data.id) ?? null;
    return { item };
  });
