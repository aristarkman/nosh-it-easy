import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { pointInPolygon, type LatLng } from "@/lib/point-in-polygon";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";
const GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

type GeocodeResponse = {
  status?: string;
  results?: { geometry?: { location?: { lat: number; lng: number } } }[];
};

function serverSupabase() {
  const key = process.env['SUPABASE_PUBLISHABLE_KEY']!;
  return createClient<Database>(process.env['SUPABASE_URL']!, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

async function geocode(address: string): Promise<LatLng | null> {
  const LOVABLE_API_KEY = process.env['LOVABLE_API_KEY'];
  const GOOGLE_MAPS_API_KEY =
    process.env['GOOGLE_MAPS_API_KEY'] ??
    process.env['GOOGLE_MAPS_API_KEY_1'] ??
    process.env['GOOGLE_MAPS_API_KEY_2'];
  if (!GOOGLE_MAPS_API_KEY) return null;
  const encoded = encodeURIComponent(address);

  if (LOVABLE_API_KEY) {
    try {
      const res = await fetch(`${GATEWAY_URL}/maps/api/geocode/json?address=${encoded}&region=us`, {
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
        },
      });
      const json = (await res.json()) as GeocodeResponse;
      const loc = res.ok && json.status === "OK" ? json.results?.[0]?.geometry?.location : null;
      if (loc) return { lat: loc.lat, lng: loc.lng };
    } catch (error) {
      console.warn("zone geocode gateway failed", error);
    }
  }

  try {
    const res = await fetch(
      `${GOOGLE_GEOCODE_URL}?address=${encoded}&region=us&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`,
    );
    const json = (await res.json()) as GeocodeResponse;
    const loc = res.ok && json.status === "OK" ? json.results?.[0]?.geometry?.location : null;
    if (loc) return { lat: loc.lat, lng: loc.lng };
  } catch (error) {
    console.error("zone geocode failed", error);
  }
  return null;
}

export type ZoneCheck =
  | { ok: true; zoneId: string; zoneName: string; fee: number; minimum: number }
  | { ok: false; message: string };

export async function verifyZone(input: {
  address: string;
  locationId: string;
  subtotal: number;
}): Promise<ZoneCheck> {
  const geo = await geocode(input.address);
  if (!geo) {
    return { ok: false, message: "We couldn't verify that delivery address. Please check it and try again." };
  }

  const supabase = serverSupabase();
  const { data, error } = await supabase
    .from("delivery_zone_polygons")
    .select("id,name,fee,minimum,polygon")
    .eq("location_id", input.locationId)
    .eq("active", true);

  if (error) {
    return { ok: false, message: "We couldn't check the delivery area right now. Please try again." };
  }

  const match = (data ?? []).find((z) =>
    pointInPolygon(geo, (z.polygon as unknown as LatLng[]) ?? []),
  );
  if (!match) {
    return { ok: false, message: "That address is outside our delivery area for this location." };
  }
  const minimum = Number(match.minimum);
  if (input.subtotal < minimum) {
    return { ok: false, message: `Delivery to that address requires a $${minimum.toFixed(2)} minimum.` };
  }
  return { ok: true, zoneId: match.id, zoneName: match.name, fee: Number(match.fee), minimum };
}
