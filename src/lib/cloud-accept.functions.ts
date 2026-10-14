import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { dispatchShipday } from "./shipday.functions";
import { sendOrderStatusSms } from "./sms.functions";

// Glen Rock ASAP delivery orders are accepted + sent to Shipday from the
// cloud right after checkout, so they never wait on the store tablet being
// awake. Scheduled orders are untouched (handled by the requote-scheduled
// cron). The tablet still prints these (it looks for the cloudaccept:1 flag).
const CLOUD_ACCEPT_LOCATIONS = new Set(["glen-rock"]);

type Item = { name: string; quantity: number; unitPrice: number };

function parseTip(notes: string | null): number {
  const m = notes?.match(/(?:^|\|\s*)tip:([0-9]+(?:\.[0-9]+)?)/);
  return m ? Number(m[1]) : 0;
}

export const cloudAcceptOrder = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error || !order) return { ok: false as const, message: "Order not found" };

    // Guards: public endpoint, so only act on brand-new, eligible orders.
    const ageMs = Date.now() - new Date(order.created_at).getTime();
    if (
      !CLOUD_ACCEPT_LOCATIONS.has(order.location_id) ||
      order.order_type !== "delivery" ||
      order.when_type !== "asap" ||
      order.status !== "new" ||
      ageMs > 10 * 60 * 1000
    ) {
      return { ok: false as const, message: "Not eligible" };
    }

    const cleaned = (order.notes ?? "")
      .split("|")
      .map((p) => p.trim())
      .filter((p) => p && !p.startsWith("delivery:"));
    const notes = [...cleaned, "delivery:shipday", "cloudaccept:1"].join(" | ");

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("orders")
      .update({ status: "accepted", notes })
      .eq("id", order.id)
      .eq("status", "new")
      .select("id");
    if (upErr || !updated?.length) return { ok: false as const, message: "Already handled" };

    const locationName = order.location_id === "glen-rock" ? "Glen Rock" : order.location_id;

    if (order.customer_phone && /(?:^|\|\s*)sms:1(?:\s*\||$)/.test(order.notes ?? "")) {
      await sendOrderStatusSms({
        data: {
          to: order.customer_phone,
          status: "accepted",
          orderNumber: order.order_number,
          customerName: order.customer_name,
          orderType: order.order_type,
          locationName,
        },
      }).catch((e) => console.error("Cloud accept SMS failed:", e));
    }

    const items = (Array.isArray(order.items) ? order.items : []) as unknown as Item[];
    const result = await dispatchShipday({
      data: {
        orderNumber: order.order_number,
        locationId: order.location_id,
        customerName: order.customer_name,
        customerPhone: order.customer_phone,
        customerEmail: order.customer_email,
        deliveryAddress: order.delivery_address ?? "",
        total: Number(order.total),
        subtotal: Number(order.subtotal),
        tax: Number(order.tax),
        tip: parseTip(order.notes),
        deliveryFee: Number(order.delivery_fee),
        notes,
        scheduledTime: null,
        items: items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice })),
      },
    }).catch((e) => ({
      ok: false as const,
      message: e instanceof Error ? e.message : "Could not reach Shipday.",
    }));

    if (!result.ok || !("shipdayOrderId" in result) || !result.shipdayOrderId) {
      const message = ("message" in result && result.message) || "Shipday dispatch failed";
      await supabaseAdmin.from("system_alerts").insert({
        kind: "shipday_dispatch_failed",
        severity: "error",
        location_id: order.location_id,
        order_number: order.order_number,
        order_id: order.id,
        message,
      });
      return { ok: false as const, message };
    }

    await supabaseAdmin
      .from("orders")
      .update({
        shipday_order_id: result.shipdayOrderId,
        shipday_tracking_url: result.trackingUrl,
        quoted_delivery_fee: Number(order.delivery_fee),
        dispatched_at: new Date().toISOString(),
        delivery_status: "unassigned",
      })
      .eq("id", order.id);
    return { ok: true as const };
  });
