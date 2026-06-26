import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { MenuItem, ModifierGroup, ModifierOption, Category } from "@/lib/menu-types";

const DEFAULT_LOCATION = "cresskill";

async function buildMenu(locationId: string): Promise<{ items: MenuItem[]; categories: Category[] }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [itemsRes, pricesRes, availRes, migRes, mgRes, moRes, catsRes, photosRes] = await Promise.all([
    supabaseAdmin
      .from("menu_items")
      .select("id,name,slug,description,category,popular,photo_url,sort_order,gluten_free_possible,available_locations")
      .eq("active", true)
      .contains("available_locations", [locationId])
      .order("sort_order")
      .order("name"),
    supabaseAdmin
      .from("menu_item_prices")
      .select("menu_item_id,price")
      .eq("location_id", "cresskill"),
    supabaseAdmin
      .from("menu_item_availability")
      .select("menu_item_id,sold_out")
      .eq("location_id", locationId)
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

  const categories: Category[] = (catsRes.data ?? []).map((c) => ({
    id: c.name,
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
    // Item must have a price row for this location to be available here.
    if (price == null || price < 0) continue;
    const itemGroups = groupsByItem.get(it.id) ?? [];
    if (price === 0) {
      const hasPricedModifier = itemGroups.some((g) => g.options.some((o) => (o.price ?? 0) > 0));
      if (!hasPricedModifier) continue;
    }
    const raw = (it.category ?? "").trim();
    if (!validCatNames.has(raw)) continue;
    const cat = raw;
    const photos = photosByItem.get(it.id) ?? [];
    const primary = photos[0] ?? it.photo_url ?? undefined;
    items.push({
      id: it.id,
      slug: it.slug,
      name: it.name,
      description: it.description ?? "",
      price,
      category: cat,
      rawCategory: it.category,
      image: primary,
      images: photos.length > 0 ? photos : (it.photo_url ? [it.photo_url] : []),
      popular: !!it.popular,
      soldOut: soldOut.has(it.id),
      glutenFreePossible: !!(it as { gluten_free_possible?: boolean }).gluten_free_possible,
      modifierGroups: itemGroups,
    });
  }
  return { items, categories };
}

const locationSchema = z.object({ locationId: z.string().min(1).optional() }).optional();

export const getMenu = createServerFn({ method: "GET" })
  .inputValidator((input) => locationSchema.parse(input))
  .handler(async ({ data }) => {
    return await buildMenu(data?.locationId ?? DEFAULT_LOCATION);
  });

export const getMenuItem = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ slug: z.string().min(1), locationId: z.string().min(1).optional() }).parse(input))
  .handler(async ({ data }) => {
    const { items } = await buildMenu(data.locationId ?? DEFAULT_LOCATION);
    const item = items.find((i) => i.slug === data.slug) ?? null;
    return { item };
  });



