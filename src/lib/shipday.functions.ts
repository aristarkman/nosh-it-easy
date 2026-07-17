import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

function shipdayErrorMessage(status: number, body: Record<string, unknown>): string {
  const apiMessage =
    (typeof body.message === "string" && body.message) ||
    (typeof body.error === "string" && body.error) ||
    (typeof body.detail === "string" && body.detail) ||
    null;

  if (status === 401 || status === 403) {
    return "Shipday rejected this store's API key. Check the location-specific Shipday secret.";
  }
  if (status === 400 || status === 404) {
    return apiMessage || "No Shipday service is available for this address.";
  }
  return apiMessage || `Shipday error (${status})`;
}

const QuoteInput = z.object({
  locationId: z.string().min(1).max(64),
  deliveryAddress: z.string().min(5).max(500),
  total: z.number().nonnegative(),
});

export const quoteShipday = createServerFn({ method: "POST" })
  .inputValidator((input) => QuoteInput.parse(input))
  .handler(async () => ({ ok: false as const, message: "" }));

const DispatchInput = z.object({
  orderNumber: z.string().min(1).max(64),
  locationId: z.string().min(1).max(64),
  customerName: z.string().min(1).max(200),
  customerPhone: z.string().min(7).max(40),
  customerEmail: z.string().email().nullable().optional(),
  deliveryAddress: z.string().min(5).max(500),
  total: z.number().nonnegative(),
  subtotal: z.number().nonnegative(),
  tax: z.number().nonnegative(),
  tip: z.number().nonnegative(),
  deliveryFee: z.number().nonnegative(),
  notes: z.string().max(2000).optional().nullable(),
  scheduledTime: z.string().min(1).max(100).optional().nullable(),
  items: z
    .array(
      z.object({
        name: z.string().max(200),
        quantity: z.number().int().positive(),
        unitPrice: z.number().nonnegative(),
      })
    )
    .max(100),
});

export const dispatchShipday = createServerFn({ method: "POST" })
  .inputValidator((input) => DispatchInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: savedOrder, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("status,shipday_order_id,shipday_tracking_url")
      .eq("order_number", data.orderNumber)
      .maybeSingle();

    if (orderError) {
      console.error("Shipday pre-dispatch order lookup failed:", orderError);
      return { ok: false as const, message: "Could not verify that the order was accepted." };
    }
    if (!savedOrder || !["accepted", "ready"].includes(savedOrder.status)) {
      return {
        ok: true as const,
        shipdayOrderId: null,
        trackingUrl: null,
        skipped: true as const,
      };
    }
    if (savedOrder.shipday_order_id) {
      return {
        ok: true as const,
        shipdayOrderId: savedOrder.shipday_order_id,
        trackingUrl: savedOrder.shipday_tracking_url,
        skipped: false as const,
      };
    }

    const apiKey = getApiKey(data.locationId);
    if (!apiKey) {
      return {
        ok: false as const,
        message: `Shipday is not configured for ${data.locationId}. Add the location-specific API key.`,
      };
    }
    const pickup = PICKUPS[data.locationId];
    if (!pickup) {
      return { ok: false as const, message: `No pickup address for ${data.locationId}` };
    }

    const payload = {
      orderNumber: data.orderNumber,
      customerName: data.customerName,
      customerAddress: data.deliveryAddress,
      customerPhoneNumber: data.customerPhone,
      customerEmail: data.customerEmail || undefined,
      restaurantName: pickup.name,
      restaurantAddress: pickup.address,
      restaurantPhoneNumber: pickup.phone,
      orderItems: data.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      tips: data.tip,
      tax: data.tax,
      discountAmount: 0,
      deliveryFee: data.deliveryFee,
      totalOrderCost: data.total,
      deliveryInstruction: data.notes || undefined,
      paymentMethod: "credit_card",
      expectedPickupTime: data.scheduledTime || undefined,
    };

    try {
      const response = await fetch(`${SHIPDAY_BASE}/orders`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const text = await response.text();
      let body: Record<string, unknown> = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { raw: text };
      }
      if (!response.ok) {
        console.error("Shipday create order failed:", {
          status: response.status,
          locationId: data.locationId,
          orderNumber: data.orderNumber,
          body,
        });
        return {
          ok: false as const,
          message: shipdayErrorMessage(response.status, body),
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
      return {
        ok: true as const,
        shipdayOrderId: id != null ? String(id) : null,
        trackingUrl,
        skipped: false as const,
      };
    } catch (error) {
      console.error("Shipday request error:", error);
      return { ok: false as const, message: "Could not reach Shipday." };
    }
  });
