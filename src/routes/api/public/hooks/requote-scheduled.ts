import { createFileRoute } from "@tanstack/react-router";

const SHIPDAY_BASE = "https://api.shipday.com";

const PICKUPS: Record<string, { name: string; address: string; phone: string }> = {
  "glen-rock": {
    name: "The Famous Kosher Nosh — Glen Rock",
    address: "230 Rock Rd, Glen Rock, NJ 07452",
    phone: "+12013310000",
  },
  cresskill: {
    name: "The Famous Kosher Nosh — Cresskill",
    address: "27 Union Ave, Cresskill, NJ 07626",
    phone: "+12018713535",
  },
};

function getApiKey(locationId: string): string | undefined {
  const KEYS: Record<string, string | undefined> = {
    "glen-rock": process.env.SHIPDAY_API_KEY,
    cresskill: process.env.SHIPDAY_API_KEY_CRESSKILL,
  };
  return KEYS[locationId] ?? process.env.SHIPDAY_API_KEY;
}

type CartItem = { name: string; quantity: number; unitPrice: number };

type OrderRow = {
  id: string;
  order_number: string;
  location_id: string;
  delivery_address: string | null;
  total: number | string;
  subtotal: number | string;
  tax: number | string;
  delivery_fee: number | string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  notes: string | null;
  items: unknown;
  scheduled_time: string | null;
};

function parseTip(notes: string | null): number {
  if (!notes) return 0;
  const m = notes.match(/tip:([0-9]+(?:\.[0-9]+)?)/);
  return m ? Number(m[1]) : 0;
}

async function dispatch(o: OrderRow): Promise<{ ok: true; id: string | null; trackingUrl: string | null } | { ok: false; message: string }> {
  const apiKey = getApiKey(o.location_id);
  const pickup = PICKUPS[o.location_id];
  if (!apiKey || !pickup) return { ok: false, message: "Shipday not configured" };
  if (!o.delivery_address) return { ok: false, message: "Missing delivery address" };

  const items = Array.isArray(o.items) ? (o.items as CartItem[]) : [];
  const tip = parseTip(o.notes);

  const payload = {
    orderNumber: o.order_number,
    customerName: o.customer_name,
    customerAddress: o.delivery_address,
    customerPhoneNumber: o.customer_phone,
    customerEmail: o.customer_email || undefined,
    restaurantName: pickup.name,
    restaurantAddress: pickup.address,
    restaurantPhoneNumber: pickup.phone,
    orderItems: items.map((it) => ({
      name: it.name,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
    })),
    tips: tip,
    tax: Number(o.tax),
    discountAmount: 0,
    deliveryFee: Number(o.delivery_fee),
    totalOrderCost: Number(o.total),
    deliveryInstruction: o.notes || undefined,
    paymentMethod: "credit_card",
    expectedPickupTime: o.scheduled_time || undefined,
  };

  try {
    const res = await fetch(`${SHIPDAY_BASE}/orders`, {
      method: "POST",
      headers: { Authorization: `Basic ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
    const id =
      (body.orderId as string | number | undefined) ??
      (body.id as string | number | undefined) ??
      null;
    const trackingUrl =
      (body.trackingLink as string | undefined) ??
      (body.trackingUrl as string | undefined) ??
      null;
    return { ok: true, id: id != null ? String(id) : null, trackingUrl };
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

        // Dispatch any scheduled delivery order whose pickup time is within the
        // next 45 minutes (or already past-due) and hasn't been sent to Shipday.
        const cutoff = new Date(Date.now() + 45 * 60 * 1000).toISOString();

        const { data: orders, error } = await supabaseAdmin
          .from("orders")
          .select(
            "id, order_number, location_id, delivery_address, total, subtotal, tax, delivery_fee, customer_name, customer_phone, customer_email, notes, items, scheduled_time"
          )
          .eq("order_type", "delivery")
          .eq("when_type", "schedule")
          .is("shipday_order_id", null)
          .in("status", ["new", "accepted", "ready"])
          .lte("scheduled_time", cutoff);

        if (error) {
          console.error("requote-scheduled query error:", error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        let checked = 0;
        let dispatched = 0;
        let alerted = 0;

        for (const o of (orders ?? []) as OrderRow[]) {
          if (!o.delivery_address) continue;
          checked++;

          const result = await dispatch(o);
          if (result.ok) {
            dispatched++;
            await supabaseAdmin
              .from("orders")
              .update({
                shipday_order_id: result.id,
                shipday_tracking_url: result.trackingUrl,
                quoted_delivery_fee: Number(o.delivery_fee),
                dispatched_at: new Date().toISOString(),
              })
              .eq("id", o.id);
            continue;
          }

          // Avoid duplicate alerts for the same order.
          const { data: existing } = await supabaseAdmin
            .from("system_alerts")
            .select("id")
            .eq("order_id", o.id)
            .eq("kind", "driver_unavailable_scheduled")
            .is("acknowledged_at", null)
            .limit(1);
          if (existing && existing.length > 0) continue;

          alerted++;
          await supabaseAdmin.from("system_alerts").insert({
            kind: "driver_unavailable_scheduled",
            severity: "error",
            location_id: o.location_id,
            order_number: o.order_number,
            order_id: o.id,
            message: `Could not dispatch scheduled order ${o.order_number} to Shipday (pickup ${new Date(
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
          JSON.stringify({ ok: true, checked, dispatched, alerted }),
          { headers: { "Content-Type": "application/json" } }
        );
      },
    },
  },
});
