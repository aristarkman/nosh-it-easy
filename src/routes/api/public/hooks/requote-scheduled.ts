import { createFileRoute } from "@tanstack/react-router";

const SHIPDAY_BASE = "https://api.shipday.com";

const PICKUPS: Record<string, { address: string }> = {
  "glen-rock": { address: "230 Rock Rd, Glen Rock, NJ 07452" },
  cresskill: { address: "27 Union Ave, Cresskill, NJ 07626" },
};

function getApiKey(locationId: string): string | undefined {
  const KEYS: Record<string, string | undefined> = {
    "glen-rock": process.env.SHIPDAY_API_KEY,
    cresskill: process.env.SHIPDAY_API_KEY_CRESSKILL,
  };
  return KEYS[locationId] ?? process.env.SHIPDAY_API_KEY;
}

type QuoteResult =
  | { ok: true; fee: number; etaMinutes: number | null }
  | { ok: false; message: string };

async function quote(
  locationId: string,
  deliveryAddress: string,
  total: number
): Promise<QuoteResult> {
  const apiKey = getApiKey(locationId);
  const pickup = PICKUPS[locationId];
  if (!apiKey || !pickup) return { ok: false, message: "Delivery not configured" };
  try {
    const res = await fetch(`${SHIPDAY_BASE}/on-demand/quote`, {
      method: "POST",
      headers: { Authorization: `Basic ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        pickupAddress: pickup.address,
        deliveryAddress,
        orderValue: total,
      }),
    });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = {};
    }
    if (!res.ok) {
      return {
        ok: false,
        message:
          res.status === 404 || res.status === 400
            ? "No drivers available for this address."
            : `Shipday error (${res.status})`,
      };
    }
    const fee =
      (body.fee as number | undefined) ??
      (body.deliveryFee as number | undefined) ??
      ((body.quote as Record<string, unknown> | undefined)?.fee as number | undefined) ??
      null;
    const etaMinutes =
      (body.etaMinutes as number | undefined) ?? (body.eta as number | undefined) ?? null;
    if (fee == null) return { ok: false, message: "No quote available for this address." };
    return { ok: true, fee: Number(fee), etaMinutes: etaMinutes != null ? Number(etaMinutes) : null };
  } catch {
    return { ok: false, message: "Could not reach Shipday." };
  }
}

export const Route = createFileRoute("/api/public/hooks/requote-scheduled")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const now = new Date();
        const windowStart = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
        const windowEnd = new Date(now.getTime() + 45 * 60 * 1000).toISOString();

        // Find scheduled delivery orders entering the 30-45 min window
        // that are still active (not delivered/cancelled) and not yet dispatched to Shipday.
        const { data: orders, error } = await supabaseAdmin
          .from("orders")
          .select(
            "id, order_number, location_id, delivery_address, total, scheduled_time, shipday_order_id"
          )
          .eq("order_type", "delivery")
          .eq("when_type", "scheduled")
          .is("shipday_order_id", null)
          .in("status", ["new", "accepted", "preparing", "ready"])
          .gte("scheduled_time", windowStart)
          .lte("scheduled_time", windowEnd);

        if (error) {
          console.error("requote-scheduled query error:", error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        let checked = 0;
        let alerted = 0;
        let okCount = 0;

        for (const o of orders ?? []) {
          if (!o.delivery_address) continue;
          checked++;

          // Skip if we've already raised an unresolved alert for this order.
          const { data: existing } = await supabaseAdmin
            .from("system_alerts")
            .select("id")
            .eq("order_id", o.id)
            .eq("kind", "driver_unavailable_scheduled")
            .is("acknowledged_at", null)
            .limit(1);
          if (existing && existing.length > 0) continue;

          const result = await quote(o.location_id, o.delivery_address, Number(o.total));
          if (result.ok) {
            okCount++;
            continue;
          }

          alerted++;
          await supabaseAdmin.from("system_alerts").insert({
            kind: "driver_unavailable_scheduled",
            severity: "error",
            location_id: o.location_id,
            order_number: o.order_number,
            order_id: o.id,
            message: `No driver quote for scheduled order ${o.order_number} (pickup ${new Date(
              o.scheduled_time as string
            ).toLocaleString()}): ${result.message}`,
            details: {
              scheduled_time: o.scheduled_time,
              delivery_address: o.delivery_address,
              reason: result.message,
            },
          });
        }

        return new Response(
          JSON.stringify({ ok: true, checked, alerted, okCount }),
          { headers: { "Content-Type": "application/json" } }
        );
      },
    },
  },
});
