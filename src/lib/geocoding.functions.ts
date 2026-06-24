import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

const InputSchema = z.object({
  address: z.string().min(3).max(500),
});

export const geocodeAddress = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY_1 ?? process.env.GOOGLE_MAPS_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (!GOOGLE_MAPS_API_KEY) throw new Error("GOOGLE_MAPS_API_KEY is not configured");

    const url = `${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(data.address)}&region=us`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
      },
    });
    const json = (await res.json()) as {
      status: string;
      results?: { geometry?: { location?: { lat: number; lng: number } }; formatted_address?: string }[];
    };
    if (!res.ok || json.status !== "OK" || !json.results?.length) {
      return { ok: false as const, message: `Could not find address (${json.status ?? res.status})` };
    }
    const loc = json.results[0].geometry?.location;
    if (!loc) return { ok: false as const, message: "No coordinates returned" };
    return {
      ok: true as const,
      lat: loc.lat,
      lng: loc.lng,
      formatted: json.results[0].formatted_address ?? null,
    };
  });
