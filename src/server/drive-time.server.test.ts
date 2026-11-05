import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estimateDriverPickup } from "./drive-time.server";

const delivery = new Date(Date.now() + 3 * 3600_000);
delivery.setUTCMinutes(30, 0, 0);
const deliveryIso = delivery.toISOString();
const input = { locationId: "glen-rock", address: "1 Main St, Ridgewood, NJ 07450", deliveryIso };

function mockFetch(impl: () => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}
const ok = (duration: string) =>
  new Response(JSON.stringify({ routes: [{ duration }] }), { status: 200 });

describe("estimateDriverPickup (Google Routes)", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("asks for pessimistic traffic-aware driving from the store to the address", async () => {
    const fetchMock = mockFetch(async () => ok("840s")); // 14 min
    const result = await estimateDriverPickup(input);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("test-key");
    expect(headers["X-Goog-FieldMask"]).toBe("routes.duration");
    const body = JSON.parse(init.body as string);
    expect(body.origin.address).toContain("894 Prospect St");
    expect(body.destination.address).toBe(input.address);
    expect(body.travelMode).toBe("DRIVE");
    expect(body.routingPreference).toBe("TRAFFIC_AWARE_OPTIMAL");
    expect(body.trafficModel).toBe("PESSIMISTIC");
    expect(new Date(body.departureTime).getTime()).toBeGreaterThan(Date.now());

    // 14 min drive + 5 handoff = 19 -> 20 min before delivery
    expect(result?.driveMinutes).toBe(14);
    expect(result?.pickupIso).toBe(new Date(delivery.getTime() - 20 * 60_000).toISOString());
  });

  it("returns null (default lead) on an API error such as Routes not being enabled", async () => {
    mockFetch(async () =>
      new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED", message: "API not enabled" } }), {
        status: 403,
      }),
    );
    expect(await estimateDriverPickup(input)).toBeNull();
  });

  it("returns null when there's no route, a network error, or no key", async () => {
    mockFetch(async () => new Response(JSON.stringify({}), { status: 200 }));
    expect(await estimateDriverPickup(input)).toBeNull();

    mockFetch(async () => {
      throw new Error("network down");
    });
    expect(await estimateDriverPickup(input)).toBeNull();

    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    vi.stubEnv("GOOGLE_MAPS_API_KEY_1", "");
    vi.stubEnv("GOOGLE_MAPS_API_KEY_2", "");
    // empty-string env still counts as "set" for ??, so remove them outright
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY_1;
    delete process.env.GOOGLE_MAPS_API_KEY_2;
    expect(await estimateDriverPickup(input)).toBeNull();
  });

  it("returns null for an unknown store without calling Google", async () => {
    const fetchMock = mockFetch(async () => ok("600s"));
    expect(await estimateDriverPickup({ ...input, locationId: "nowhere" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
