import { createFileRoute } from "@tanstack/react-router";

// Shipday → our webhook. Shipday sends a "token" header that must match one of
// our per-store tokens. Both stores hit this same URL; we accept either token.
//
// Shipday event names we care about (varies a bit by account/version):
//   ORDER_ASSIGNED / ORDER_ACCEPTED_AND_STARTED → assigned
//   ORDER_ONTHEWAY / ORDER_PICKED_UP            → out_for_delivery
//   ORDER_COMPLETED / ORDER_DELIVERED            → delivered

type DeliveryStatus = "unassigned" | "assigned" | "out_for_delivery" | "delivered";

function mapEvent(event: string | undefined): DeliveryStatus | null {
  if (!event) return null;
  const e = event.toUpperCase();
  if (e.includes("DELIVERED") || e.includes("COMPLETED")) return "delivered";
  if (e.includes("ONTHEWAY") || e.includes("ON_THE_WAY") || e.includes("PICKED_UP") || e.includes("PICKEDUP"))
    return "out_for_delivery";
  if (e.includes("ASSIGNED") || e.includes("ACCEPTED")) return "assigned";
  if (e.includes("UNASSIGNED") || e.includes("FAILED_TO_DELIVER")) return "unassigned";
  return null;
}

export const Route = createFileRoute("/api/public/hooks/shipday")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const token =
          request.headers.get("token") ||
          request.headers.get("Token") ||
          request.headers.get("x-shipday-token") ||
          "";
        const expected = [
          process.env.SHIPDAY_WEBHOOK_TOKEN_GLEN_ROCK,
          process.env.SHIPDAY_WEBHOOK_TOKEN_CRESSKILL,
        ].filter(Boolean) as string[];
        if (!token || !expected.includes(token)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let payload: Record<string, unknown>;
        try {
          payload = await request.json();
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        const event = (payload.event as string) || (payload.eventType as string) || "";
        const order = (payload.order as Record<string, unknown>) || payload;
        const orderNumber =
          (order.orderNumber as string) ||
          (order.order_number as string) ||
          (payload.orderNumber as string) ||
          "";
        const trackingUrl =
          (order.trackingLink as string) ||
          (order.trackingUrl as string) ||
          (payload.trackingLink as string) ||
          null;

        const status = mapEvent(event);
        if (!orderNumber) {
          console.warn("Shipday webhook missing orderNumber", { event });
          return new Response("ok"); // ack so Shipday stops retrying
        }

        const update: {
          delivery_status?: DeliveryStatus;
          shipday_tracking_url?: string;
          status?: "new" | "accepted" | "ready" | "completed" | "cancelled";
        } = {};
        if (status) update.delivery_status = status;
        if (trackingUrl) update.shipday_tracking_url = trackingUrl;
        if (status === "delivered") update.status = "completed";

        if (Object.keys(update).length) {
          const { error } = await supabaseAdmin
            .from("orders")
            .update(update)
            .eq("order_number", orderNumber);
          if (error) {
            console.error("Shipday webhook update failed:", error);
            return new Response("DB error", { status: 500 });
          }
        }

        return new Response("ok");
      },
    },
  },
});
