import { PICKUPS } from "../lib/store-pickups";
import { PICKUP_LEAD_MINUTES, pickupFromDriveSeconds } from "../lib/shipday-times";

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const TIMEOUT_MS = 4000;

// Traffic-aware driving time from the store to the customer for a trip
// leaving around `departureIso`. PESSIMISTIC traffic on purpose: a driver
// who's a few minutes early beats a customer who's a few minutes late.
// Returns null on any failure (API not enabled on the key, timeout, no
// route, ...) so callers fall back to the default pickup lead.
async function fetchDriveSeconds(input: {
  originAddress: string;
  destinationAddress: string;
  departureIso: string;
}): Promise<number | null> {
  const key =
    process.env.GOOGLE_MAPS_API_KEY ??
    process.env.GOOGLE_MAPS_API_KEY_1 ??
    process.env.GOOGLE_MAPS_API_KEY_2;
  if (!key) {
    console.warn("drive-time: no GOOGLE_MAPS_API_KEY configured; using default pickup lead");
    return null;
  }

  // departureTime can't be in the past for DRIVE; omit it to mean "now".
  const departureInFuture = new Date(input.departureIso).getTime() > Date.now() + 60_000;
  const body = {
    origin: { address: input.originAddress },
    destination: { address: input.destinationAddress },
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE_OPTIMAL",
    trafficModel: "PESSIMISTIC",
    ...(departureInFuture ? { departureTime: new Date(input.departureIso).toISOString() } : {}),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ROUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "routes.duration",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as {
      routes?: { duration?: string }[];
      error?: { status?: string; message?: string };
    };
    if (!res.ok) {
      console.warn("drive-time: Google Routes API error; using default pickup lead", {
        httpStatus: res.status,
        status: json.error?.status,
        message: json.error?.message,
      });
      return null;
    }
    const seconds = parseFloat(json.routes?.[0]?.duration ?? ""); // e.g. "1234s"
    if (!Number.isFinite(seconds) || seconds <= 0) {
      console.warn("drive-time: Google returned no usable route; using default pickup lead");
      return null;
    }
    return seconds;
  } catch (error) {
    console.warn("drive-time: Google Routes request failed; using default pickup lead", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function estimateDriverPickup(input: {
  locationId: string;
  address: string;
  deliveryIso: string;
}): Promise<{ pickupIso: string; driveMinutes: number } | null> {
  const store = PICKUPS[input.locationId];
  if (!store) return null;
  // The driver leaves roughly one default-lead before the customer's time;
  // traffic around then is what matters.
  const departureIso = new Date(
    new Date(input.deliveryIso).getTime() - PICKUP_LEAD_MINUTES * 60_000,
  ).toISOString();
  const seconds = await fetchDriveSeconds({
    originAddress: store.address,
    destinationAddress: input.address,
    departureIso,
  });
  if (seconds == null) return null;
  return {
    pickupIso: pickupFromDriveSeconds(input.deliveryIso, seconds),
    driveMinutes: Math.round(seconds / 60),
  };
}
