// Public menu feed for external marketing sites (e.g. koshernosh.com).
// Read-only. Exposes ONLY publicly safe menu data. No customer, order, payment,
// cost, margin, inventory, supplier, staff, or admin fields are returned.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Configurable allowed origins (comma-separated). Falls back to sensible defaults.
const DEFAULT_ORIGINS = [
  "https://koshernosh.com",
  "https://www.koshernosh.com",
  "https://base44.app",
  "https://base44.com",
  "http://localhost:3000",
  "http://localhost:5173",
];
const ALLOWED_ORIGINS = (Deno.env.get("PUBLIC_MENU_FEED_ORIGINS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const originAllowlist = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_ORIGINS;

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed =
    originAllowlist.includes(origin) ||
    originAllowlist.some((o) => o.endsWith(".base44.app") && origin.endsWith(".base44.app"));
  return {
    "Access-Control-Allow-Origin": allowed ? origin : originAllowlist[0] ?? "*",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
    "Access-Control-Max-Age": "86400",
  };
}

function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "") || "n-a";
}

function jsonResponse(body: unknown, status: number, req: Request, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=300",
      ...corsHeaders(req),
      ...extra,
    },
  });
}

const LOCATIONS = [
  { id: "glen-rock", name: "Glen Rock", slug: "glen-rock" },
  { id: "cresskill", name: "Cresskill", slug: "cresskill" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "GET") {
    return jsonResponse(
      { error: "method_not_allowed", message: "Only GET is supported." },
      405,
      req,
    );
  }

  try {
    const url = new URL(req.url);
    const locationFilter = url.searchParams.get("location");
    const categoryFilter = url.searchParams.get("category");
    const updatedSinceRaw = url.searchParams.get("updated_since");
    const updatedSince = updatedSinceRaw ? new Date(updatedSinceRaw) : null;
    if (updatedSinceRaw && Number.isNaN(updatedSince?.getTime())) {
      return jsonResponse(
        { error: "invalid_parameter", message: "updated_since must be an ISO timestamp." },
        400,
        req,
      );
    }

    // Server-only service role client. Never returned to caller.
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Location filter validation
    let locationScope: string[] | null = null;
    if (locationFilter) {
      const match = LOCATIONS.find((l) => l.slug === locationFilter || l.id === locationFilter);
      if (!match) {
        return jsonResponse(
          { error: "invalid_parameter", message: "Unknown location." },
          400,
          req,
        );
      }
      locationScope = [match.id];
    }

    // Fetch categories, items, prices, availability, photos in parallel.
    const [catsRes, itemsRes, pricesRes, availRes, photosRes] = await Promise.all([
      supabase
        .from("menu_categories")
        .select("id,name,blurb,sort_order,active,updated_at")
        .eq("active", true)
        .order("sort_order")
        .order("name"),
      supabase
        .from("menu_items")
        .select(
          "id,name,slug,description,category,popular,photo_url,sort_order,gluten_free_possible,available_locations,active,updated_at",
        )
        .eq("active", true),
      supabase
        .from("menu_item_prices")
        .select("menu_item_id,location_id,price"),
      supabase
        .from("menu_item_availability")
        .select("menu_item_id,location_id,sold_out,sold_out_until"),
      supabase
        .from("menu_item_photos")
        .select("menu_item_id,url,sort_order")
        .order("sort_order"),
    ]);

    for (const r of [catsRes, itemsRes, pricesRes, availRes, photosRes]) {
      if (r.error) throw r.error;
    }

    // Build categories with slug + filter
    const categories = (catsRes.data ?? [])
      .map((c) => ({
        id: c.id as string,
        name: c.name as string,
        slug: slugify(c.name as string),
        description: (c.blurb as string | null) ?? null,
        display_order: (c.sort_order as number) ?? 0,
        active: !!c.active,
        updated_at: c.updated_at as string,
      }))
      .filter((c) => (categoryFilter ? c.slug === categoryFilter : true))
      .filter((c) => (updatedSince ? new Date(c.updated_at) > updatedSince : true));

    const catByName = new Map(
      (catsRes.data ?? []).map((c) => [c.name as string, c.id as string]),
    );
    const catSlugById = new Map(
      (catsRes.data ?? []).map((c) => [c.id as string, slugify(c.name as string)]),
    );

    // Prices grouped by item + location
    type PriceRow = { price: number };
    const priceByItemLoc = new Map<string, Map<string, PriceRow>>();
    for (const p of pricesRes.data ?? []) {
      const itemMap = priceByItemLoc.get(p.menu_item_id as string) ?? new Map();
      itemMap.set(p.location_id as string, { price: Number(p.price) });
      priceByItemLoc.set(p.menu_item_id as string, itemMap);
    }

    // Sold-out set per location. A row with sold_out_until in the past has
    // auto-expired back to available, same as the ordering site.
    const now = Date.now();
    const soldOut = new Set<string>();
    for (const a of availRes.data ?? []) {
      if (!a.sold_out) continue;
      if (a.sold_out_until && new Date(a.sold_out_until as string).getTime() <= now) continue;
      soldOut.add(`${a.menu_item_id}::${a.location_id}`);
    }

    // Photos
    const photosByItem = new Map<string, string[]>();
    for (const ph of photosRes.data ?? []) {
      const arr = photosByItem.get(ph.menu_item_id as string) ?? [];
      arr.push(ph.url as string);
      photosByItem.set(ph.menu_item_id as string, arr);
    }

    const validCatIds = new Set(categories.map((c) => c.id));

    const items = [];
    for (const it of itemsRes.data ?? []) {
      const catId = catByName.get((it.category as string | null) ?? "");
      if (!catId) continue; // hide items with no matching active public category
      if (categoryFilter && !validCatIds.has(catId)) continue;

      const availableLocs: string[] = Array.isArray(it.available_locations)
        ? (it.available_locations as string[])
        : [];
      const scopedLocs = LOCATIONS.filter(
        (l) => availableLocs.includes(l.id) && (!locationScope || locationScope.includes(l.id)),
      );
      if (!scopedLocs.length) continue;

      const priceMap = priceByItemLoc.get(it.id as string);
      const locationsPayload = scopedLocs
        .map((l) => {
          const price = priceMap?.get(l.id)?.price;
          if (price == null || price < 0) return null;
          const isSoldOut = soldOut.has(`${it.id}::${l.id}`);
          return {
            location_id: l.id,
            available: !isSoldOut,
            price: Number(price.toFixed(2)),
            price_display_text: price === 0 ? "Market price" : null,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      if (!locationsPayload.length) continue;

      // Hide items that are $0 at every scoped location (likely internal placeholders).
      const hasPositivePrice = locationsPayload.some((l) => l.price > 0);
      if (!hasPositivePrice) continue;

      const photos = photosByItem.get(it.id as string) ?? [];
      const primary = photos[0] ?? (it.photo_url as string | null) ?? null;
      const additional = photos.slice(1);

      const dietary: string[] = [];
      if (it.gluten_free_possible) dietary.push("gluten_free_possible");
      if (it.popular) dietary.push("popular");

      const updatedAt = (it.updated_at as string) ?? new Date(0).toISOString();
      if (updatedSince && new Date(updatedAt) <= updatedSince) continue;

      items.push({
        id: it.id as string,
        name: it.name as string,
        slug: (it.slug as string) ?? slugify(it.name as string),
        short_description: (it.description as string | null) ?? null,
        full_description: (it.description as string | null) ?? null,
        category_id: catId,
        category_slug: catSlugById.get(catId) ?? null,
        subcategory: null,
        image_url: primary,
        additional_image_urls: additional,
        display_order: (it.sort_order as number) ?? 0,
        featured: !!it.popular,
        seasonal: false,
        active: !!it.active,
        dietary_labels: dietary,
        allergen_notes: null,
        ordering_url: `https://takeout.koshernosh.com/item/${(it.slug as string) ?? slugify(it.name as string)}`,
        updated_at: updatedAt,
        locations: locationsPayload,
      });
    }

    const body = {
      generated_at: new Date().toISOString(),
      source: "takeout.koshernosh.com",
      locations: locationScope
        ? LOCATIONS.filter((l) => locationScope!.includes(l.id))
        : LOCATIONS,
      categories,
      items,
    };

    // Compute a weak Last-Modified from newest updated_at we returned.
    const newest = [...categories, ...items]
      .map((r) => new Date(r.updated_at).getTime())
      .filter((t) => Number.isFinite(t))
      .reduce((a, b) => Math.max(a, b), 0);
    const extra: Record<string, string> = {};
    if (newest > 0) extra["Last-Modified"] = new Date(newest).toUTCString();

    return jsonResponse(body, 200, req, extra);
  } catch (err) {
    console.error("[public-menu-feed]", err);
    return jsonResponse(
      {
        error: "menu_feed_unavailable",
        message: "The public menu feed could not be generated.",
      },
      500,
      req,
    );
  }
});
