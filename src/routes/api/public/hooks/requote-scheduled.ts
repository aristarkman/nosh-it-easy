import { createFileRoute } from "@tanstack/react-router";

const SHIPDAY_BASE = "https://api.shipday.com";

const PICKUPS: Record<string, { name: string; address: string; phone: string }> = {
  "glen-rock": {
    name: "The Kosher Nosh",
    address: "894 Prospect St, Glen Rock, NJ 07452",
    phone: "+12014451186",
  },
  cresskill: {
    name: "The Nosh",
    address: "172 Piermont Road, Cresskill, NJ 07626",
    phone: "+12013310000",
  },
};

function getApiKey(locationId: string): string | undefined {
  const key =
    locationId === "glen-rock"
      ? process.env.SHIPDAY_API_KEY
      : locationId === "cresskill"
        ? process.env.SHIPDAY_API_KEY_CRESSKILL
        : undefined;
  return key?.trim() || undefined;
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
  const match = notes.match(/tip:([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : 0;
}

// Shipday wants expectedPickupTime as HH:mm:ss (and a separate expectedDeliveryDate
// as YYYY-MM-DD). Send the raw UTC components — Shipday converts to the account's
// local timezone for display itself; pre-converting to Eastern here caused a
// double offset (e.g. 4:45pm EDT showed up in Shipday as 12:45pm).
function toShipdayDateTime(isoString: string): { date: string; time: string } {
  const iso = new Date(isoString).toISOString(); // e.g. "2026-07-23T20:45:00.000Z"
  return { date: iso.slice(0, 10), time: iso.slice(11, 19) };
}

async function dispatch(
  order: OrderRow
): Promise<
  | { ok: true; id: string | null; trackingUrl: string | null }
  | { ok: false; message: string }
> {
  const apiKey = getApiKey(order.location_id);
  const pickup = PICKUPS[order.location_id];
  if (!apiKey || !pickup) return { ok: false, message: "Shipday not configured" };
  if (!order.delivery_address) return { ok: false, message: "Missing delivery address" };

  const items = Array.isArray(order.items) ? (order.items as CartItem[]) : [];
  const scheduled = order.scheduled_time ? toShipdayDateTime(order.scheduled_time) : null;
  const payload = {
    orderNumber: order.order_number,
    customerName: order.customer_name,
    customerAddress: order.delivery_address,
    customerPhoneNumber: order.customer_phone,
    customerEmail: order.customer_email || undefined,
    restaurantName: pickup.name,
    restaurantAddress: pickup.address,
    restaurantPhoneNumber: pickup.phone,
    orderItems: items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
    tips: parseTip(order.notes),
    tax: Number(order.tax),
    discountAmount: 0,
    deliveryFee: Number(order.delivery_fee),
    totalOrderCost: Number(order.total),
    deliveryInstruction: order.notes || undefined,
    paymentMethod: "credit_card",
    expectedPickupTime: scheduled?.time,
    expectedDeliveryDate: scheduled?.date,
  };

  try {
    const response = await fetch(`${SHIPDAY_BASE}/orders`, {
      method: "POST",
      headers: { Authorization: `Basic ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }
    if (!response.ok || body.success === false) {
      const apiMessage =
        (typeof body.response === "string" && body.response) ||
        (typeof body.message === "string" && body.message) ||
        (typeof body.error === "string" && body.error) ||
        `Shipday error (${response.status})`;
      return { ok: false, message: apiMessage };
    }
    const id =
      (body.orderId as string | number | undefined) ??
      (body.id as string | number | undefined) ??
      null;
    if (id == null) {
      return { ok: false, message: "Shipday did not return an order ID." };
    }
    const trackingUrl =
      (body.trackingLink as string | undefined) ??
      (body.trackingUrl as string | undefined) ??
      null;

    // Explicitly flag the order ready-to-pickup so Shipday moves it from the
    // Scheduled tab to Current immediately, rather than waiting on Shipday's
    // own Dispatch Time Window setting to do it.
    if (id != null) {
      try {
        await fetch(`${SHIPDAY_BASE}/orders/${id}/meta`, {
          method: "PUT",
          headers: { Authorization: `Basic ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ readyToPickup: true }),
        });
      } catch (e) {
        console.error(`Failed to mark Shipday order ${id} ready-to-pickup:`, e);
      }
    }

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
        const cutoff = new Date(Date.now() + 45 * 60 * 1000).toISOString();

        const { data: orders, error } = await supabaseAdmin
          .from("orders")
          .select(
            "id, order_number, location_id, delivery_address, total, subtotal, tax, delivery_fee, customer_name, customer_phone, customer_email, notes, items, scheduled_time"
          )
          .eq("order_type", "delivery")
          .eq("when_type", "schedule")
          .is("shipday_order_id", null)
          .in("status", ["accepted", "ready"])
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

        for (const order of (orders ?? []) as OrderRow[]) {
          if (!order.delivery_address || !order.notes?.includes("delivery:shipday")) continue;
          checked++;

          const result = await dispatch(order);
          if (result.ok) {
            dispatched++;
            await supabaseAdmin
              .from("orders")
              .update({
                shipday_order_id: result.id,
                shipday_tracking_url: result.trackingUrl,
                quoted_delivery_fee: Number(order.delivery_fee),
                dispatched_at: new Date().toISOString(),
              })
              .eq("id", order.id);
            continue;
          }

          const { data: existing } = await supabaseAdmin
            .from("system_alerts")
            .select("id")
            .eq("order_id", order.id)
            .eq("kind", "driver_unavailable_scheduled")
            .is("acknowledged_at", null)
            .limit(1);
          if (existing && existing.length > 0) continue;

          alerted++;
          await supabaseAdmin.from("system_alerts").insert({
            kind: "driver_unavailable_scheduled",
            severity: "error",
            location_id: order.location_id,
            order_number: order.order_number,
            order_id: order.id,
            message: `Could not dispatch scheduled order ${order.order_number} to Shipday (pickup ${new Date(
              order.scheduled_time as string
            ).toLocaleString()}): ${result.message}`,
            details: {
              scheduled_time: order.scheduled_time,
              delivery_address: order.delivery_address,
              reason: result.message,
            },
          });
        }

        return new Response(JSON.stringify({ ok: true, checked, dispatched, alerted }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
