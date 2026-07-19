// Server-side order pricing. This is the ONLY place that should be trusted
// to turn a cart into dollar amounts. The client sends item ids, modifier
// option ids, and quantities — never prices. Everything money-related
// (subtotal, tax, discounts, delivery fee, card fee, total) is derived here
// from the database, right before charging and inserting the order.
//
// Why this exists: the checkout page's reactive totals (subtotal/tax/total
// shown to the customer as they shop) are plain client-side React state,
// computed for a responsive UI. That's fine for *display*. It is NOT safe to
// use those numbers for the actual card charge or the order row, because
// client-side state — including the whole cart's prices — can be edited by
// anyone with devtools open before the "Place order" click. Use
// `priceCart`/`placeOrder` at the moment of truth instead.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { maxRewardsRedeemable, discountForRewards } from "@/lib/loyalty";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const CartLineInput = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(50),
  modifierOptionIds: z.array(z.string().uuid()).max(50).default([]),
  notes: z.string().max(500).optional(),
});

const TAX_RATE = 0.06625;
const MAX_TIP_CENTS = 50000; // $500 sanity cap

const PricingInput = z.object({
  locationId: z.enum(["glen-rock", "cresskill"]),
  orderType: z.enum(["pickup", "delivery"]),
  lines: z.array(CartLineInput).min(1).max(100),
  promoCode: z.string().trim().max(64).optional().nullable(),
  userId: z.string().uuid().optional().nullable(),
  customerPhone: z.string().trim().max(32).optional().nullable(),
  rewardsToUse: z.number().int().min(0).max(1000).default(0),
  payMethod: z.enum(["card", "applepay", "googlepay", "in-person"]),
  deliveryZoneId: z.string().uuid().optional().nullable(),
  tipAmount: z.number().min(0).default(0),
});

export type PricingInput = z.infer<typeof PricingInput>;

export type PricedLine = {
  lineId: string;
  itemId: string;
  name: string;
  basePrice: number;
  unitPrice: number;
  quantity: number;
  taxable: boolean;
  notes?: string;
  modifiers: { groupId: string; groupName: string; options: { id: string; name: string; price?: number }[] }[];
};

export type PricingResult = {
  ok: true;
  lineItems: PricedLine[];
  subtotal: number;
  taxableSubtotal: number;
  promo: { id: string; code: string; discountAmount: number } | null;
  promoError: string | null;
  rewardsUsed: number;
  loyaltyDiscount: number;
  discounts: number;
  discountedSubtotal: number;
  deliveryFee: number;
  tax: number;
  cardFee: number;
  tipAmount: number;
  total: number;
};

class PricingError extends Error {}

// supabaseAdmin's generated type doesn't know about the promo_codes select
// shape returned by the RPC; keep this loosely typed at the boundary rather
// than fighting the generated types for an internal-only helper.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function computePricing(input: PricingInput, admin: any): Promise<PricingResult> {
  const itemIds = [...new Set(input.lines.map((l) => l.itemId))];
  const optionIds = [...new Set(input.lines.flatMap((l) => l.modifierOptionIds))];

  const [itemsRes, pricesRes, assignRes, optionsRes] = await Promise.all([
    admin.from("menu_items").select("id,name,active,available_locations,taxable").in("id", itemIds),
    admin.from("menu_item_prices").select("menu_item_id,price").eq("location_id", "cresskill").in("menu_item_id", itemIds),
    admin.from("menu_item_modifier_groups").select("menu_item_id,modifier_group_id").in("menu_item_id", itemIds),
    optionIds.length
      ? admin.from("modifier_options").select("id,group_id,name,price_delta").in("id", optionIds)
      : Promise.resolve({ data: [] as { id: string; group_id: string; name: string; price_delta: number }[] }),
  ]);
  if (itemsRes.error) throw new PricingError(itemsRes.error.message);
  if (pricesRes.error) throw new PricingError(pricesRes.error.message);
  if (optionsRes.error) throw new PricingError(optionsRes.error.message);

  const groupIds = [...new Set((assignRes.data ?? []).map((a: { modifier_group_id: string }) => a.modifier_group_id))];
  const groupsRes = groupIds.length
    ? await admin.from("modifier_groups").select("id,name").in("id", groupIds)
    : { data: [] as { id: string; name: string }[] };
  const groupNameById = new Map<string, string>((groupsRes.data ?? []).map((g: { id: string; name: string }) => [g.id, g.name]));

  type Item = { id: string; name: string; active: boolean; available_locations: string[]; taxable: boolean };
  const itemById = new Map<string, Item>((itemsRes.data ?? []).map((i: Item) => [i.id, i]));
  const priceById = new Map<string, number>(
    (pricesRes.data ?? []).map((p: { menu_item_id: string; price: number }) => [p.menu_item_id, Number(p.price)])
  );
  const optionById = new Map<string, { id: string; group_id: string; name: string; price_delta: number }>(
    (optionsRes.data ?? []).map((o: { id: string; group_id: string; name: string; price_delta: number }) => [o.id, o])
  );
  const allowedGroupsByItem = new Map<string, Set<string>>();
  for (const a of (assignRes.data ?? []) as { menu_item_id: string; modifier_group_id: string }[]) {
    const s = allowedGroupsByItem.get(a.menu_item_id) ?? new Set<string>();
    s.add(a.modifier_group_id);
    allowedGroupsByItem.set(a.menu_item_id, s);
  }

  const lineItems: PricedLine[] = [];
  let subtotal = 0;
  let taxableSubtotal = 0;

  for (const line of input.lines) {
    const item = itemById.get(line.itemId);
    if (!item || !item.active) throw new PricingError("One of the items in your cart is no longer available.");
    if (!(item.available_locations ?? []).includes(input.locationId)) {
      throw new PricingError(`${item.name} isn't available at this location.`);
    }
    const basePrice = priceById.get(line.itemId);
    if (basePrice == null) throw new PricingError(`${item.name} doesn't have a price configured.`);

    const allowedGroups = allowedGroupsByItem.get(line.itemId) ?? new Set<string>();
    const byGroup = new Map<string, { id: string; name: string; price?: number }[]>();
    let modPrice = 0;
    for (const optId of line.modifierOptionIds) {
      const opt = optionById.get(optId);
      if (!opt || !allowedGroups.has(opt.group_id)) {
        throw new PricingError(`${item.name} has an invalid modifier selection.`);
      }
      modPrice += Number(opt.price_delta) || 0;
      const arr = byGroup.get(opt.group_id) ?? [];
      arr.push({ id: opt.id, name: opt.name, price: Number(opt.price_delta) || undefined });
      byGroup.set(opt.group_id, arr);
    }
    const modifiers = [...byGroup.entries()].map(([groupId, options]) => ({
      groupId,
      groupName: groupNameById.get(groupId) ?? groupId,
      options,
    }));

    const unitPrice = round2(basePrice + modPrice);
    const taxable = item.taxable !== false;
    lineItems.push({
      lineId: crypto.randomUUID(),
      itemId: item.id,
      name: item.name,
      basePrice,
      unitPrice,
      quantity: line.quantity,
      taxable,
      notes: line.notes,
      modifiers,
    });
    subtotal += unitPrice * line.quantity;
    if (taxable) taxableSubtotal += unitPrice * line.quantity;
  }
  subtotal = round2(subtotal);
  taxableSubtotal = round2(taxableSubtotal);

  // ---- Promo (re-validated server-side against the real subtotal) ----
  let promo: { id: string; code: string; discountAmount: number } | null = null;
  let promoError: string | null = null;
  let promoDiscount = 0;
  if (input.promoCode) {
    const { data: pr, error: prErr } = await admin.rpc("validate_promo", {
      _code: input.promoCode,
      _user_id: input.userId ?? null,
      _customer_phone: input.customerPhone ?? null,
      _subtotal: subtotal,
      _item_ids: itemIds,
    });
    if (prErr) {
      promoError = "Couldn't validate promo code.";
    } else if (!pr?.ok) {
      promoError = pr?.message ?? "Invalid promo code";
    } else {
      if (pr.discount_type === "percent") {
        promoDiscount = round2((subtotal * Number(pr.discount_value)) / 100);
      } else if (pr.discount_type === "fixed") {
        promoDiscount = round2(Math.min(subtotal, Number(pr.discount_value)));
      } else if (pr.discount_type === "bogo") {
        const hasBuy = lineItems.some((l) => l.itemId === pr.bogo_buy_item_id && l.quantity >= 1);
        const getLines = lineItems.filter((l) => l.itemId === pr.bogo_get_item_id && l.quantity >= 1);
        if (hasBuy && getLines.length) {
          promoDiscount = round2(Math.min(...getLines.map((l) => l.unitPrice)));
        }
      }
      if (promoDiscount > 0 || pr.discount_type !== "bogo") {
        promo = { id: pr.id, code: pr.code, discountAmount: promoDiscount };
      } else {
        promoError = "BOGO item not eligible with current cart.";
      }
    }
  }

  // ---- Loyalty (balance re-fetched server-side, never trusted from client) ----
  let loyaltyBalance = 0;
  if (input.userId) {
    const { data: bal } = await admin.rpc("loyalty_balance", { _user_id: input.userId });
    loyaltyBalance = typeof bal === "number" ? bal : 0;
  }
  const maxRewards = maxRewardsRedeemable(loyaltyBalance, subtotal);
  const rewardsUsed = Math.max(0, Math.min(input.rewardsToUse, maxRewards));
  const loyaltyDiscount = discountForRewards(rewardsUsed);

  const discounts = round2(Math.min(subtotal, promoDiscount + loyaltyDiscount));
  const discountedSubtotal = round2(subtotal - discounts);
  // Spread the discount proportionally across taxable/non-taxable lines so a
  // promo/loyalty credit doesn't change what fraction of the order is taxed.
  const discountRatio = subtotal > 0 ? discountedSubtotal / subtotal : 1;
  const discountedTaxableSubtotal = round2(taxableSubtotal * discountRatio);
  const tax = round2(discountedTaxableSubtotal * TAX_RATE);

  // ---- Delivery fee: resolved from the zone row itself, never a client-supplied number ----
  let deliveryFee = 0;
  if (input.orderType === "delivery") {
    if (!input.deliveryZoneId) throw new PricingError("Select a delivery address within our delivery area.");
    const { data: zone, error: zoneErr } = await admin
      .from("delivery_zone_polygons")
      .select("fee,minimum,active,location_id")
      .eq("id", input.deliveryZoneId)
      .maybeSingle();
    if (zoneErr || !zone || !zone.active || zone.location_id !== input.locationId) {
      throw new PricingError("That delivery zone is no longer valid. Please re-check your address.");
    }
    if (subtotal < Number(zone.minimum)) {
      throw new PricingError(`A $${Number(zone.minimum).toFixed(2)} minimum order is required for delivery to this address.`);
    }
    deliveryFee = round2(Number(zone.fee));
  }

  const tipAmount = round2(Math.max(0, Math.min(input.tipAmount, MAX_TIP_CENTS / 100)));
  const cardFee = input.payMethod === "in-person" ? 0 : round2((discountedSubtotal + deliveryFee) * 0.03);
  const total = round2(discountedSubtotal + deliveryFee + tax + tipAmount + cardFee);

  return {
    ok: true,
    lineItems,
    subtotal,
    taxableSubtotal,
    promo,
    promoError,
    rewardsUsed,
    loyaltyDiscount,
    discounts,
    discountedSubtotal,
    deliveryFee,
    tax,
    cardFee,
    tipAmount,
    total,
  };
}

export const priceCart = createServerFn({ method: "POST" })
  .inputValidator((input) => PricingInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await computePricing(data, supabaseAdmin);
    } catch (e) {
      return { ok: false as const, message: e instanceof PricingError ? e.message : "Couldn't price your order. Please try again." };
    }
  });
