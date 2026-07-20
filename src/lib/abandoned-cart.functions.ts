import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "@/integrations/supabase/types";

const CartLine = z.object({
  itemId: z.string().optional(),
  name: z.string().optional(),
  quantity: z.number().int().min(1).max(999),
  price: z.number().min(0).max(100000).optional(),
}).passthrough();

const UpsertSchema = z.object({
  sessionId: z.string().min(8).max(128),
  userId: z.string().uuid().nullable().optional(),
  customerName: z.string().max(120).nullable().optional(),
  email: z.string().email().max(200).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  locationId: z.string().max(80).nullable().optional(),
  orderType: z.string().max(40).nullable().optional(),
  items: z.array(CartLine).max(200),
  subtotal: z.number().min(0).max(100000),
  itemCount: z.number().int().min(0).max(9999),
  marketingEmailOptIn: z.boolean().optional(),
  marketingSmsOptIn: z.boolean().optional(),
});

export const upsertAbandonedCart = createServerFn({ method: "POST" })
  .inputValidator((input: z.infer<typeof UpsertSchema>) => UpsertSchema.parse(input))
  .handler(async ({ data }) => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Backend is missing public database configuration.");

    const authHeader = getRequestHeader("authorization") ?? undefined;
    const supabase = createClient<Database>(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: {
        headers: authHeader ? { Authorization: authHeader } : undefined,
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
            headers.delete("Authorization");
          }
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    });

    const { error } = await supabase.rpc("upsert_abandoned_cart_secure", {
      _session_id: data.sessionId,
      _customer_name: data.customerName ?? undefined,
      _email: data.email ?? undefined,
      _phone: data.phone ?? undefined,
      _location_id: data.locationId ?? undefined,
      _order_type: data.orderType ?? undefined,
      _items: data.items as unknown as Json,
      _subtotal: data.subtotal,
      _item_count: data.itemCount,
      _marketing_email_opt_in: data.marketingEmailOptIn ?? false,
      _marketing_sms_opt_in: data.marketingSmsOptIn ?? false,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const RecoverSchema = z.object({
  sessionId: z.string().min(8).max(128),
  orderId: z.string().uuid(),
});

export const markAbandonedCartRecovered = createServerFn({ method: "POST" })
  .inputValidator((input: z.infer<typeof RecoverSchema>) => RecoverSchema.parse(input))
  .handler(async ({ data }) => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Backend is missing public database configuration.");

    const authHeader = getRequestHeader("authorization") ?? undefined;
    const supabase = createClient<Database>(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: {
        headers: authHeader ? { Authorization: authHeader } : undefined,
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
            headers.delete("Authorization");
          }
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    });

    const { error } = await supabase.rpc("mark_abandoned_cart_recovered_secure", {
      _session_id: data.sessionId,
      _order_id: data.orderId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
