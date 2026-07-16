import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";
const GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

const InputSchema = z.object({
  address: z.string().min(3).max(500),
});

type GeocodeResponse = {
  status?: string;
  error_message?: string;
  results?: {
    geometry?: { location?: { lat: number; lng: number } };
    formatted_address?: string;
  }[];
};

function parseResult(json: GeocodeResponse) {
  const loc = json.results?.[0]?.geometry?.location;
  if (!loc) return null;
  return {
    ok: true as const,
    lat: loc.lat,
    lng: loc.lng,
    formatted: json.results?.[0]?.formatted_address ?? null,
  };
}

export const geocodeAddress = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const GOOGLE_MAPS_API_KEY =
      process.env.GOOGLE_MAPS_API_KEY ??
      process.env.GOOGLE_MAPS_API_KEY_1 ??
      process.env.GOOGLE_MAPS_API_KEY_2;

    if (!GOOGLE_MAPS_API_KEY) {
      return { ok: false as const, message: "Address lookup is not configured." };
    }

    const encodedAddress = encodeURIComponent(data.address);

    // Prefer Lovable's managed connector when available.
    if (LOVABLE_API_KEY) {
      try {
        const gatewayUrl = `${GATEWAY_URL}/maps/api/geocode/json?address=${encodedAddress}&region=us`;
        const gatewayRes = await fetch(gatewayUrl, {
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
          },
        });
        const gatewayJson = (await gatewayRes.json()) as GeocodeResponse;
        const parsed = gatewayRes.ok && gatewayJson.status === "OK" ? parseResult(gatewayJson) : null;
        if (parsed) return parsed;

        console.warn("Lovable geocoding gateway failed; trying Google directly", {
          httpStatus: gatewayRes.status,
          apiStatus: gatewayJson.status,
          error: gatewayJson.error_message,
        });
      } catch (error) {
        console.warn("Lovable geocoding gateway request failed; trying Google directly", error);
      }
    }

    // Fallback for environments where the Lovable connector route is unavailable.
    try {
      const directUrl = `${GOOGLE_GEOCODE_URL}?address=${encodedAddress}&region=us&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;
      const directRes = await fetch(directUrl);
      const directJson = (await directRes.json()) as GeocodeResponse;
      const parsed = directRes.ok && directJson.status === "OK" ? parseResult(directJson) : null;
      if (parsed) return parsed;

      console.error("Google geocoding failed", {
        httpStatus: directRes.status,
        apiStatus: directJson.status,
        error: directJson.error_message,
      });

      if (directJson.status === "ZERO_RESULTS") {
        return { ok: false as const, message: "We couldn't recognize that address. Include the street, city, state, and ZIP code." };
      }
      if (directJson.status === "REQUEST_DENIED") {
        return { ok: false as const, message: "Address lookup is temporarily unavailable." };
      }
      return { ok: false as const, message: "We couldn't verify that address. Please check it and try again." };
    } catch (error) {
      console.error("Google geocoding request failed", error);
      return { ok: false as const, message: "Address lookup is temporarily unavailable." };
    }
  });
