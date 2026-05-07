import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SHIPDAY_BASE = "https://api.shipday.com";

// Pickup addresses for each store (full street addresses, required by Shipday)
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
  notes: z.string().max(1000).optional().nullable(),
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
    const apiKey = process.env.SHIPDAY_API_KEY;
    if (!apiKey) {
      return { ok: false as const, message: "Shipday is not configured." };
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
      orderItems: data.items.map((it) => ({
        name: it.name,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
      })),
      tips: data.tip,
      tax: data.tax,
      discountAmount: 0,
      deliveryFee: data.deliveryFee,
      totalOrderCost: data.total,
      deliveryInstruction: data.notes || undefined,
      paymentMethod: "credit_card",
    };

    try {
      const res = await fetch(`${SHIPDAY_BASE}/orders`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let body: Record<string, unknown> = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { raw: text };
      }
      if (!res.ok) {
        console.error("Shipday create order failed:", res.status, body);
        return {
          ok: false as const,
          message: `Shipday error (${res.status})`,
          details: body,
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
      };
    } catch (err) {
      console.error("Shipday request error:", err);
      return { ok: false as const, message: "Could not reach Shipday." };
    }
  });
