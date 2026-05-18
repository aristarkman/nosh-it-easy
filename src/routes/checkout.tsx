import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CreditCard, Wallet, Apple, AlertTriangle, Lock, Tag, Gift } from "lucide-react";
import { useOrder, fmt, LOCATIONS } from "@/lib/order-context";
import { useCustomerAuth } from "@/lib/customer-auth";
import { supabase } from "@/integrations/supabase/client";
import { chargeWithToken, getFtdConfig } from "@/server/ipospays.functions";
import { sendOrderStatusSms, sendStaffNewOrderAlert } from "@/server/sms.functions";
import { dispatchShipday, quoteShipday } from "@/server/shipday.functions";
import { reportSystemAlert } from "@/lib/system-alerts";
import { markCartRecovered, track } from "@/lib/analytics";
import {
  POINTS_PER_REWARD,
  REWARD_VALUE,
  discountForRewards,
  maxRewardsRedeemable,
  pointsEarnedFor,
  pointsForRewards,
} from "@/lib/loyalty";
import { toast } from "sonner";
import { geocodeAddress } from "@/lib/geocoding.functions";
import { pointInPolygon } from "@/lib/point-in-polygon";

type SavedAddress = {
  id: string;
  label: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
  is_default: boolean;
};

const PAY_IN_PERSON_THRESHOLD = 100;
const TIP_PRESETS = [0.15, 0.18, 0.2];

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — The Kosher Nosh" },
      { name: "description", content: "Complete your Kosher Nosh order." },
    ],
  }),
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("kn-order-v1");
        const s = raw ? JSON.parse(raw) : null;
        if (!s?.cart?.length) throw redirect({ to: "/cart" });
      } catch (e) {
        if ((e as { isRedirect?: boolean })?.isRedirect) throw e;
      }
    }
  },
  component: CheckoutPage,
});

declare global {
  interface Window {
    postData?: () => Promise<{ payment_token_id?: string; paymentTokenId?: string } | undefined>;
  }
}

function CheckoutPage() {
  const navigate = useNavigate();
  const { cart, subtotal, location, orderType, clearCart } = useOrder();
  const auth = useCustomerAuth();
  const loc = LOCATIONS.find((l) => l.id === location);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [zip, setZip] = useState("");
  const [whenType, setWhenType] = useState<"asap" | "schedule">("asap");
  const [scheduledTime, setScheduledTime] = useState("");
  const [pay, setPay] = useState<"card" | "applepay" | "googlepay" | "in-person">("card");
  const [submitting, setSubmitting] = useState(false);

  const [tipMode, setTipMode] = useState<"preset" | "custom" | "none">("preset");
  const [tipPreset, setTipPreset] = useState<number>(0.18);
  const [tipCustom, setTipCustom] = useState<string>("");

  const [zones, setZones] = useState<{ id: string; name: string; fee: number; minimum: number; polygon: { lat: number; lng: number }[] }[]>([]);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [closedToday, setClosedToday] = useState<string | null>(null);
  const [onlineHours, setOnlineHours] = useState<{ day_of_week: number; open_time: string | null; close_time: string | null; is_closed: boolean }[]>([]);
  const [closures, setClosures] = useState<{ start_date: string; end_date: string }[]>([]);

  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddrId, setSelectedAddrId] = useState<string>("");

  const [ftdReady, setFtdReady] = useState(false);
  const ftdLoadedRef = useRef(false);

  // Promo code
  const [promoInput, setPromoInput] = useState("");
  const [promoChecking, setPromoChecking] = useState(false);
  const [promo, setPromo] = useState<{
    id: string;
    code: string;
    discount_type: "percent" | "fixed" | "bogo";
    discount_value: number;
    bogo_buy_item_id: string | null;
    bogo_get_item_id: string | null;
  } | null>(null);

  // Loyalty: 1 pt / $1, 100 pts = $5 off
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  const [rewardsToUse, setRewardsToUse] = useState(0);

  // Autofill from profile + addresses when signed in
  useEffect(() => {
    if (!auth.authed || !auth.userId) return;
    (async () => {
      const [{ data: profile }, { data: addrs }] = await Promise.all([
        supabase
          .from("customer_profiles")
          .select("full_name,phone,email")
          .eq("user_id", auth.userId!)
          .maybeSingle(),
        supabase
          .from("customer_addresses")
          .select("id,label,address_line1,address_line2,city,state,zip,is_default")
          .eq("user_id", auth.userId!)
          .order("is_default", { ascending: false }),
      ]);
      if (profile) {
        if (profile.full_name) setName((n) => n || profile.full_name!);
        if (profile.phone) setPhone((p) => p || profile.phone!);
        if (profile.email) setEmail((e) => e || profile.email!);
      } else if (auth.email) {
        setEmail((e) => e || auth.email);
      }
      const list = (addrs ?? []) as SavedAddress[];
      setSavedAddresses(list);
      const def = list.find((a) => a.is_default) ?? list[0];
      if (def && orderType === "delivery" && !address) {
        setSelectedAddrId(def.id);
        setAddress(`${def.address_line1}${def.address_line2 ? `, ${def.address_line2}` : ""}, ${def.city}, ${def.state}`);
        setZip(def.zip);
      }
    })();
  }, [auth.authed, auth.userId, auth.email, orderType, address]);



  useEffect(() => {
    if (!location) return;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [{ data: z }, { data: c }, { data: h }] = await Promise.all([
        supabase.from("delivery_zone_polygons").select("id,name,fee,minimum,polygon").eq("location_id", location).eq("active", true).order("sort_order"),
        supabase
          .from("store_closures")
          .select("reason,location_id,start_date,end_date")
          .gte("end_date", today),
        supabase
          .from("store_hours")
          .select("day_of_week,open_time,close_time,is_closed,hours_kind,location_id")
          .eq("location_id", location)
          .eq("hours_kind", "online"),
      ]);
      setZones(
        (z ?? []).map((x) => ({
          id: x.id as string,
          name: x.name as string,
          fee: Number(x.fee),
          minimum: Number(x.minimum),
          polygon: (x.polygon as { lat: number; lng: number }[]) ?? [],
        })),
      );
      const allClosures = (c ?? []).filter((x) => x.location_id === null || x.location_id === location);
      setClosures(allClosures.map((x) => ({ start_date: x.start_date, end_date: x.end_date })));
      const hitToday = allClosures.find((x) => x.start_date <= today && x.end_date >= today);
      setClosedToday(hitToday ? hitToday.reason ?? "Closed today" : null);
      setOnlineHours((h ?? []) as typeof onlineHours);
    })();
  }, [location]);

  // Load Freedom-to-Design script when card is selected
  useEffect(() => {
    if (pay !== "card" || ftdLoadedRef.current) return;
    ftdLoadedRef.current = true;
    (async () => {
      try {
        const cfg = await getFtdConfig();
        const s = document.createElement("script");
        s.id = "ftd";
        s.src = cfg.scriptUrl;
        s.setAttribute("security_key", cfg.authToken);
        s.setAttribute("data-tpn", cfg.tpn);
        s.defer = true;
        s.onload = () => setFtdReady(true);
        s.onerror = () => toast.error("Could not load secure card form.");
        document.head.appendChild(s);
      } catch (e) {
        console.error(e);
        toast.error("Card payments are not configured yet.");
      }
    })();
  }, [pay]);

  // Loyalty: load points balance
  useEffect(() => {
    if (!auth.authed || !auth.userId) {
      setLoyaltyBalance(0);
      return;
    }
    (async () => {
      const { data } = await supabase.rpc("loyalty_balance", { _user_id: auth.userId! } as never);
      setLoyaltyBalance(typeof data === "number" ? data : 0);
    })();
  }, [auth.authed, auth.userId]);

  // Track checkout_started once on mount
  useEffect(() => {
    void track("checkout_started", {
      props: { subtotal, itemCount: cart.reduce((n, l) => n + l.quantity, 0) },
      locationId: location,
      orderType,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPromo = async () => {
    if (!promoInput.trim()) return;
    setPromoChecking(true);
    const itemIds = Array.from(new Set(cart.map((l) => l.itemId)));
    const { data, error } = await supabase.rpc("validate_promo", {
      _code: promoInput.trim(),
      _user_id: auth.userId ?? undefined,
      _customer_phone: phone.trim() || undefined,
      _subtotal: subtotal,
      _item_ids: itemIds,
    } as never);
    setPromoChecking(false);
    if (error) return toast.error(error.message);
    const r = data as { ok: boolean; message?: string } & Record<string, unknown>;
    if (!r.ok) {
      setPromo(null);
      return toast.error(r.message || "Invalid code");
    }
    setPromo({
      id: r.id as string,
      code: r.code as string,
      discount_type: r.discount_type as "percent" | "fixed" | "bogo",
      discount_value: Number(r.discount_value) || 0,
      bogo_buy_item_id: (r.bogo_buy_item_id as string | null) ?? null,
      bogo_get_item_id: (r.bogo_get_item_id as string | null) ?? null,
    });
    toast.success(`${r.code} applied`);
  };

  // Geocode the typed address (debounced) and match against polygon zones
  useEffect(() => {
    if (orderType !== "delivery" || address.trim().length < 5 || zip.length !== 5) {
      setGeo(null);
      setGeoError(null);
      return;
    }
    let cancelled = false;
    setGeoLoading(true);
    setGeoError(null);
    const handle = setTimeout(async () => {
      try {
        const r = await geocodeAddress({ data: { address: `${address.trim()}, ${zip}` } });
        if (cancelled) return;
        if (r.ok) {
          setGeo({ lat: r.lat, lng: r.lng });
          setGeoError(null);
        } else {
          setGeo(null);
          setGeoError(r.message);
        }
      } catch {
        if (!cancelled) {
          setGeo(null);
          setGeoError("Couldn't look up that address.");
        }
      } finally {
        if (!cancelled) setGeoLoading(false);
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [orderType, address, zip]);

  const matchedZone = useMemo(() => {
    if (orderType !== "delivery" || !geo) return undefined;
    return zones.find((z) => pointInPolygon(geo, z.polygon));
  }, [orderType, geo, zones]);

  // Live Shipday on-demand quote — falls back to zone fee if unavailable.
  const [liveQuote, setLiveQuote] = useState<{
    fee: number;
    etaMinutes: number | null;
  } | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  useEffect(() => {
    if (orderType !== "delivery" || !location || address.trim().length < 5 || zip.length !== 5) {
      setLiveQuote(null);
      setQuoteError(null);
      return;
    }
    let cancelled = false;
    setQuoteLoading(true);
    setQuoteError(null);
    const handle = setTimeout(async () => {
      const r = await quoteShipday({
        data: {
          locationId: location,
          deliveryAddress: `${address.trim()}, ${zip}`,
          total: subtotal,
        },
      }).catch(() => ({ ok: false as const, message: "Could not reach delivery service." }));
      if (cancelled) return;
      setQuoteLoading(false);
      if (r.ok) {
        setLiveQuote({ fee: r.fee, etaMinutes: r.etaMinutes });
        setQuoteError(null);
      } else {
        setLiveQuote(null);
        setQuoteError(r.message);
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [orderType, location, address, zip, subtotal]);

  const deliveryFee =
    orderType === "delivery" ? liveQuote?.fee ?? matchedZone?.fee ?? 0 : 0;

  const tipAmount = useMemo(() => {
    if (orderType !== "delivery") return 0;
    if (tipMode === "none") return 0;
    if (tipMode === "custom") {
      const n = parseFloat(tipCustom);
      return isNaN(n) || n < 0 ? 0 : +n.toFixed(2);
    }
    return +(subtotal * tipPreset).toFixed(2);
  }, [orderType, tipMode, tipPreset, tipCustom, subtotal]);

  const promoDiscount = useMemo(() => {
    if (!promo) return 0;
    if (promo.discount_type === "percent") {
      return +((subtotal * promo.discount_value) / 100).toFixed(2);
    }
    if (promo.discount_type === "fixed") {
      return +Math.min(subtotal, promo.discount_value).toFixed(2);
    }
    if (promo.discount_type === "bogo") {
      // Find the cheapest unit price among lines matching the "get" item with qty>=1,
      // requires at least one of the buy item in cart.
      const hasBuy = cart.some((l) => l.itemId === promo.bogo_buy_item_id && l.quantity >= 1);
      if (!hasBuy) return 0;
      const getLines = cart.filter((l) => l.itemId === promo.bogo_get_item_id && l.quantity >= 1);
      if (!getLines.length) return 0;
      const cheapest = Math.min(...getLines.map((l) => l.unitPrice));
      return +cheapest.toFixed(2);
    }
    return 0;
  }, [promo, cart, subtotal]);

  const maxRewards = maxRewardsRedeemable(loyaltyBalance, subtotal);
  const effectiveRewards = Math.min(rewardsToUse, maxRewards);
  const loyaltyDiscount = discountForRewards(effectiveRewards);
  const discounts = +Math.min(subtotal, promoDiscount + loyaltyDiscount).toFixed(2);
  const discountedSubtotal = +(subtotal - discounts).toFixed(2);
  const tax = +(discountedSubtotal * 0.06625).toFixed(2);
  const cardFee = pay === "in-person" ? 0 : +((discountedSubtotal + deliveryFee) * 0.03).toFixed(2);
  const total = +(discountedSubtotal + deliveryFee + tax + tipAmount + cardFee).toFixed(2);

  const canPayInPerson = orderType === "pickup" && subtotal < PAY_IN_PERSON_THRESHOLD;
  const zoneOk = orderType !== "delivery" || (!!matchedZone && subtotal >= matchedZone.minimum);
  const minShortfall = orderType === "delivery" && matchedZone ? matchedZone.minimum - subtotal : 0;

  // Hours validation: ASAP requires online ordering open right now.
  // Scheduled requires the chosen time to fall inside online ordering hours and outside closure dates.
  const checkTime = (d: Date): { ok: boolean; reason?: string } => {
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const closure = closures.find((c) => c.start_date <= ymd && c.end_date >= ymd);
    if (closure) return { ok: false, reason: "We're closed on that date." };
    const row = onlineHours.find((r) => r.day_of_week === d.getDay());
    if (!row || row.is_closed || !row.open_time || !row.close_time) {
      return { ok: false, reason: "We're not accepting online orders that day." };
    }
    const [oh, om] = row.open_time.split(":").map(Number);
    const [ch, cm] = row.close_time.split(":").map(Number);
    const mins = d.getHours() * 60 + d.getMinutes();
    const openMins = oh * 60 + om;
    const closeMins = ch * 60 + cm;
    if (mins < openMins || mins > closeMins) {
      return { ok: false, reason: `Online ordering for that day runs ${row.open_time.slice(0, 5)}–${row.close_time.slice(0, 5)}.` };
    }
    return { ok: true };
  };

  const scheduleCheck = useMemo(() => {
    if (whenType !== "schedule") return { ok: true } as { ok: boolean; reason?: string };
    if (!scheduledTime) return { ok: false, reason: "Pick a date and time." };
    const d = new Date(scheduledTime);
    if (isNaN(d.getTime())) return { ok: false, reason: "Invalid time." };
    if (d.getTime() < Date.now()) return { ok: false, reason: "Pick a future time." };
    return checkTime(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whenType, scheduledTime, onlineHours, closures]);

  const asapCheck = useMemo(() => {
    if (whenType !== "asap") return { ok: true } as { ok: boolean; reason?: string };
    if (onlineHours.length === 0) return { ok: true };
    return checkTime(new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whenType, onlineHours, closures]);

  const valid =
    !closedToday &&
    asapCheck.ok &&
    scheduleCheck.ok &&
    name.trim().length > 1 &&
    /^[\d\s()+-]{7,}$/.test(phone) &&
    (orderType === "pickup" || (address.trim().length > 5 && zoneOk && !quoteError));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !location) return;
    setSubmitting(true);

    const orderNumber = `KN-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    let paymentMeta: Record<string, unknown> = {};

    try {
      if (pay === "card") {
        if (!ftdReady || typeof window.postData !== "function") {
          toast.error("Card form is still loading. Please wait a moment.");
          setSubmitting(false);
          return;
        }
        const tok = await window.postData();
        const paymentTokenId = tok?.payment_token_id ?? tok?.paymentTokenId;
        if (!paymentTokenId) {
          toast.error("Card details are invalid. Please check and try again.");
          setSubmitting(false);
          return;
        }
        const res = await chargeWithToken({
          data: {
            paymentTokenId,
            amountCents: Math.round(total * 100),
            referenceId: orderNumber,
            invoiceNumber: orderNumber,
          },
        });
        if (!res.ok) {
          toast.error(res.message || "Payment was declined.");
          void reportSystemAlert({
            kind: "payment_failed",
            message: res.message || "Card declined at checkout",
            locationId: location,
            locationName: loc?.name,
            orderNumber,
            details: { amountCents: Math.round(total * 100), customer: name.trim(), phone: phone.trim() },
          });
          setSubmitting(false);
          return;
        }
        paymentMeta = {
          processor: "ipospays",
          rrn: res.rrn,
          authCode: res.authCode,
          maskedCard: res.maskedCard,
          cardType: res.cardType,
          transactionId: res.transactionId,
        };
      }
    } catch (err) {
      console.error(err);
      toast.error("Payment failed. Please try a different card.");
      void reportSystemAlert({
        kind: "payment_failed",
        message: err instanceof Error ? err.message : "Unknown payment error",
        locationId: location,
        locationName: loc?.name,
        orderNumber,
      });
      setSubmitting(false);
      return;
    }

    const { data, error } = await supabase
      .from("orders")
      .insert({
        order_number: orderNumber,
        user_id: auth.userId,
        location_id: location,
        order_type: orderType ?? "pickup",
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        customer_email: email.trim() || null,
        delivery_address: orderType === "delivery" ? `${address.trim()}, ${zip}` : null,
        when_type: whenType,
        scheduled_time: whenType === "schedule" && scheduledTime ? scheduledTime : null,
        payment_method: pay,
        subtotal,
        delivery_fee: deliveryFee,
        tax,
        card_fee: cardFee,
        total,
        items: cart,
        notes: [
          `tip:${tipAmount.toFixed(2)}`,
          promo ? `promo:${promo.code}(-${promoDiscount.toFixed(2)})` : null,
          loyaltyDiscount ? `loyalty:-${loyaltyDiscount.toFixed(2)}` : null,
          Object.keys(paymentMeta).length ? JSON.stringify(paymentMeta) : null,
        ].filter(Boolean).join(" | "),
      })
      .select("id,order_number")
      .single();

    if (error || !data) {
      console.error(error);
      toast.error(
        pay === "card"
          ? "Payment captured but order could not be saved. Please call us."
          : "Could not place order. Please try again."
      );
      void reportSystemAlert({
        kind: "order_save_failed",
        message:
          (pay === "card" ? "Card was charged but order DB insert failed: " : "Order DB insert failed: ") +
          (error?.message ?? "unknown"),
        locationId: location,
        locationName: loc?.name,
        orderNumber,
        details: { customer: name.trim(), phone: phone.trim(), total },
      });
      setSubmitting(false);
      return;
    }

    sessionStorage.setItem(
      "kn-last-order",
      JSON.stringify({
        orderId: data.order_number,
        name,
        location: loc?.name,
        orderType,
        whenType,
        scheduledTime,
        pay,
        total,
        tip: tipAmount,
        items: cart,
      })
    );
    clearCart();

    // Record promo redemption (best-effort)
    if (promo) {
      supabase
        .from("promo_redemptions")
        .insert({
          promo_code_id: promo.id,
          user_id: auth.userId ?? null,
          customer_phone: phone.trim() || null,
          order_id: data.id,
          discount_amount: promoDiscount,
        })
        .then(({ error: e }) => e && console.error("Promo redemption save failed:", e));
    }
    // Loyalty: redeem (negative) and earn (positive on discounted subtotal)
    if (auth.userId) {
      const earnPts = pointsEarnedFor(discountedSubtotal);
      const redeemPts = pointsForRewards(effectiveRewards);
      if (redeemPts > 0) {
        supabase.from("loyalty_redemptions").insert({
          user_id: auth.userId, order_id: data.id, amount: loyaltyDiscount, points_used: redeemPts,
        }).then(({ error: e }) => e && console.error("Loyalty redemption save failed:", e));
        supabase.from("loyalty_ledger").insert({
          user_id: auth.userId, order_id: data.id, kind: "redeem", points: -redeemPts, note: `Redeemed ${effectiveRewards} reward(s)`,
        }).then(({ error: e }) => e && console.error("Loyalty ledger redeem failed:", e));
      }
      if (earnPts > 0) {
        supabase.from("loyalty_ledger").insert({
          user_id: auth.userId, order_id: data.id, kind: "earn", points: earnPts, note: `Earned on order #${data.order_number}`,
        }).then(({ error: e }) => e && console.error("Loyalty ledger earn failed:", e));
      }
    }

    // Mark abandoned cart as recovered & track conversion
    void markCartRecovered(data.id);
    void track("checkout_completed", {
      props: { orderId: data.id, orderNumber: data.order_number, total, subtotal, itemCount: cart.reduce((n,l)=>n+l.quantity,0) },
      locationId: location, orderType,
    });

    // Fire-and-forget SMS confirmation to the customer
    if (phone.trim()) {
      sendOrderStatusSms({
        data: {
          to: phone.trim(),
          status: "received",
          orderNumber: data.order_number,
          customerName: name.trim(),
          orderType: orderType ?? "pickup",
          locationName: loc?.name,
        },
      }).catch((e) => console.error("SMS send failed:", e));
    }

    // Fire-and-forget staff alert
    sendStaffNewOrderAlert({
      data: {
        orderNumber: data.order_number,
        customerName: name.trim(),
        orderType: orderType ?? "pickup",
        locationName: loc?.name,
        total,
        whenType,
        scheduledTime: whenType === "schedule" ? scheduledTime : null,
        itemCount: cart.reduce((n, l) => n + l.quantity, 0),
      },
    }).catch((e) => console.error("Staff alert failed:", e));

    // Dispatch to Shipday for delivery orders (fire-and-forget; persist tracking on response)
    if (orderType === "delivery") {
      dispatchShipday({
        data: {
          orderNumber: data.order_number,
          locationId: location,
          customerName: name.trim(),
          customerPhone: phone.trim(),
          customerEmail: email.trim() || null,
          deliveryAddress: `${address.trim()}, ${zip}`,
          total,
          subtotal,
          tax,
          tip: tipAmount,
          deliveryFee,
          notes: null,
          items: cart.map((l) => ({
            name: l.name,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
        },
      })
        .then((r) => {
          if (r.ok) {
            supabase
              .from("orders")
              .update({
                shipday_order_id: r.shipdayOrderId,
                shipday_tracking_url: r.trackingUrl,
                quoted_delivery_fee: deliveryFee,
              })
              .eq("id", data.id)
              .then(({ error: e }) => e && console.error("Shipday persist failed:", e));
          } else {
            console.error("Shipday dispatch failed:", r.message);
            void reportSystemAlert({
              kind: "shipday_dispatch_failed",
              message: r.message || "Shipday dispatch returned not-ok",
              locationId: location,
              locationName: loc?.name,
              orderNumber: data.order_number,
              orderId: data.id,
            });
          }
        })
        .catch((e) => {
          console.error("Shipday dispatch error:", e);
          void reportSystemAlert({
            kind: "shipday_dispatch_failed",
            message: e instanceof Error ? e.message : "Shipday dispatch threw",
            locationId: location,
            locationName: loc?.name,
            orderNumber: data.order_number,
            orderId: data.id,
          });
        });
    }

    navigate({ to: "/confirmation/$orderId", params: { orderId: data.order_number } });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-6">
      <Link
        to="/cart"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-4" /> Back to cart
      </Link>
      <h1 className="mt-4 font-display text-4xl font-black sm:text-5xl">Checkout</h1>

      {closedToday && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4" />
          <div>
            <strong>{loc?.name} is closed today.</strong> {closedToday}. Online ordering is paused.
          </div>
        </div>
      )}

      <form onSubmit={submit} className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="space-y-6">
          <Section title="Contact">
            <Field label="Full name" value={name} onChange={setName} required />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Phone" value={phone} onChange={setPhone} required />
              <Field label="Email (optional)" value={email} onChange={setEmail} type="email" />
            </div>
          </Section>

          {orderType === "delivery" ? (
            <Section title="Delivery address">
              {savedAddresses.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Saved addresses
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {savedAddresses.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setSelectedAddrId(a.id);
                          setAddress(`${a.address_line1}${a.address_line2 ? `, ${a.address_line2}` : ""}, ${a.city}, ${a.state}`);
                          setZip(a.zip);
                        }}
                        className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                          selectedAddrId === a.id ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary"
                        }`}
                      >
                        <div className="font-semibold">{a.label}</div>
                        <div className="text-muted-foreground">{a.address_line1}, {a.city} {a.zip}</div>
                      </button>
                    ))}
                  </div>
                  <div className="text-[11px] text-muted-foreground">Or enter a new address below.</div>
                </div>
              )}
              <Field
                label="Street address"
                value={address}
                onChange={setAddress}
                placeholder="123 Main St, Apt 4"
                required
              />
              <Field
                label="ZIP code"
                value={zip}
                onChange={(v) => setZip(v.replace(/\D/g, "").slice(0, 5))}
                placeholder="07452"
                required
              />
              {geoLoading && address.trim().length >= 5 && zip.length === 5 && (
                <p className="text-xs text-muted-foreground">Checking delivery area…</p>
              )}
              {!geoLoading && geo && !matchedZone && (
                <p className="text-xs text-destructive">
                  Sorry — that address is outside our delivery area from {loc?.name}. Try pickup instead.
                </p>
              )}
              {!geoLoading && geoError && address.trim().length >= 5 && zip.length === 5 && (
                <p className="text-xs text-destructive">{geoError}</p>
              )}
              {matchedZone && !zoneOk && (
                <p className="text-xs text-destructive">
                  ${minShortfall.toFixed(2)} below the {fmt(matchedZone.minimum)} delivery minimum for {matchedZone.name}.
                </p>
              )}
              {matchedZone && zoneOk && !liveQuote && !quoteError && (
                <p className="text-xs text-muted-foreground">
                  {quoteLoading
                    ? "Getting a live delivery quote…"
                    : `${matchedZone.name}: ${fmt(matchedZone.fee)} fee · ${fmt(matchedZone.minimum)} minimum.`}
                </p>
              )}
              {liveQuote && (
                <p className="text-xs text-secondary">
                  Live quote: {fmt(liveQuote.fee)} fee
                  {liveQuote.etaMinutes ? ` · ~${liveQuote.etaMinutes} min` : ""}
                </p>
              )}
              {quoteError && address.trim().length >= 5 && zip.length === 5 && (
                <p className="text-xs text-destructive">{quoteError}</p>
              )}
            </Section>
          ) : (
            <Section title="Pickup time">
              <div className="grid grid-cols-2 gap-2">
                <Pill active={whenType === "asap"} onClick={() => setWhenType("asap")}>
                  ASAP · ~15 min
                </Pill>
                <Pill active={whenType === "schedule"} onClick={() => setWhenType("schedule")}>
                  Schedule
                </Pill>
              </div>
              {whenType === "schedule" && (
                <input
                  type="datetime-local"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary"
                />
              )}
              {whenType === "asap" && !asapCheck.ok && (
                <p className="text-xs text-destructive">{asapCheck.reason} Pick "Schedule" to order for later.</p>
              )}
              {whenType === "schedule" && scheduledTime && !scheduleCheck.ok && (
                <p className="text-xs text-destructive">{scheduleCheck.reason}</p>
              )}
            </Section>
          )}

          {orderType === "delivery" && (
          <Section title="Tip your driver">
            <p className="text-xs text-muted-foreground">
              100% of tips go directly to your delivery driver.
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {TIP_PRESETS.map((p) => (
                <Pill
                  key={p}
                  active={tipMode === "preset" && tipPreset === p}
                  onClick={() => {
                    setTipMode("preset");
                    setTipPreset(p);
                  }}
                >
                  {Math.round(p * 100)}%
                </Pill>
              ))}
              <Pill active={tipMode === "custom"} onClick={() => setTipMode("custom")}>
                Custom
              </Pill>
              <Pill active={tipMode === "none"} onClick={() => setTipMode("none")}>
                No tip
              </Pill>
            </div>
            {tipMode === "custom" && (
              <input
                value={tipCustom}
                onChange={(e) => setTipCustom(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                placeholder="$ amount"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            )}
          </Section>
          )}

          <Section title="Promo code & rewards">
            {promo ? (
              <div className="flex items-center justify-between rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <Tag className="size-4 text-primary" />
                  <div>
                    <div className="font-bold">{promo.code} applied</div>
                    <div className="text-xs text-muted-foreground">
                      {promo.discount_type === "bogo"
                        ? "Buy 1, get 1 free"
                        : promo.discount_type === "percent"
                        ? `${promo.discount_value}% off`
                        : `$${promo.discount_value.toFixed(2)} off`}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPromo(null);
                    setPromoInput("");
                  }}
                  className="text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-destructive"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={promoInput}
                  onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                  placeholder="Enter promo code"
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm uppercase outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={applyPromo}
                  disabled={promoChecking || !promoInput.trim()}
                  className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
                >
                  {promoChecking ? "Checking…" : "Apply"}
                </button>
              </div>
            )}

            {auth.authed && maxRewards > 0 && (
              <div className="mt-1 rounded-xl border border-border bg-background p-3 text-sm">
                <div className="flex items-center gap-1.5 font-bold">
                  <Gift className="size-4 text-primary" /> Loyalty rewards
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Balance: <strong>{loyaltyBalance} pts</strong> · {POINTS_PER_REWARD} pts = ${REWARD_VALUE} off
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Array.from({ length: maxRewards + 1 }, (_, i) => i).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRewardsToUse(n)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        rewardsToUse === n
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary"
                      }`}
                    >
                      {n === 0 ? "None" : `−$${n * REWARD_VALUE} (${n * POINTS_PER_REWARD} pts)`}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {auth.authed && maxRewards === 0 && (
              <p className="text-xs text-muted-foreground">
                You have {loyaltyBalance} pts. Earn 1 pt per $1 — redeem {POINTS_PER_REWARD} pts for ${REWARD_VALUE} off.
              </p>
            )}
            {!auth.authed && (
              <p className="text-xs text-muted-foreground">
                <Link to="/login" className="font-semibold text-primary underline">
                  Sign in
                </Link>{" "}
                to earn 1 point per $1 spent ({POINTS_PER_REWARD} pts = ${REWARD_VALUE} off).
              </p>
            )}
          </Section>

          <Section title="Payment">
            <div className="grid gap-2 sm:grid-cols-2">
              <PayOption icon={<CreditCard className="size-4" />} active={pay === "card"} onClick={() => setPay("card")}>
                Credit / Debit Card
              </PayOption>
              <PayOption icon={<Apple className="size-4" />} active={pay === "applepay"} onClick={() => setPay("applepay")}>
                Apple Pay
              </PayOption>
              <PayOption icon={<Wallet className="size-4" />} active={pay === "googlepay"} onClick={() => setPay("googlepay")}>
                Google Pay
              </PayOption>
              {canPayInPerson && (
                <PayOption icon={<Wallet className="size-4" />} active={pay === "in-person"} onClick={() => setPay("in-person")}>
                  Pay in person at {loc?.name}
                </PayOption>
              )}
            </div>
            {pay !== "in-person" && (
              <p className="text-xs text-muted-foreground">
                A 3% card processing fee applies on online payments.
              </p>
            )}

            {pay === "card" && (
              <div className="mt-2 rounded-xl border border-border bg-background p-4">
                <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  <Lock className="size-3.5" /> Secure card details
                </div>
                <div className="grid gap-3">
                  <input
                    id="ccnumber"
                    placeholder="Card number"
                    autoComplete="cc-number"
                    inputMode="numeric"
                    className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      id="ccexpiry"
                      placeholder="MM / YY"
                      autoComplete="cc-exp"
                      className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary"
                    />
                    <input
                      id="cccvv"
                      placeholder="CVV"
                      autoComplete="cc-csc"
                      inputMode="numeric"
                      className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
                {!ftdReady && (
                  <p className="mt-2 text-[11px] text-muted-foreground">Loading secure form…</p>
                )}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Card data is sent directly to iPOSpays. We never see or store it.
                </p>
              </div>
            )}
          </Section>
        </div>

        <aside className="rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-24">
          <h2 className="font-display text-xl font-bold">Order summary</h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {cart.map((l) => (
              <li key={l.lineId} className="flex justify-between gap-3">
                <span className="text-foreground/80">
                  {l.quantity}× {l.name}
                </span>
                <span>{fmt(l.unitPrice * l.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="my-4 border-t border-border" />
          <Row label="Subtotal" value={fmt(subtotal)} />
          {promoDiscount > 0 && (
            <Row label={`Promo (${promo?.code})`} value={`−${fmt(promoDiscount)}`} />
          )}
          {loyaltyDiscount > 0 && <Row label="Loyalty reward" value={`−${fmt(loyaltyDiscount)}`} />}
          {orderType === "delivery" && <Row label="Delivery fee" value={fmt(deliveryFee)} />}
          <Row label="Tax" value={fmt(tax)} />
          {tipAmount > 0 && <Row label="Tip" value={fmt(tipAmount)} />}
          {cardFee > 0 && <Row label="Card processing (3%)" value={fmt(cardFee)} />}
          <div className="mt-2 border-t border-border pt-2">
            <Row label="Total" value={fmt(total)} bold />
          </div>
          <button
            type="submit"
            disabled={!valid || submitting || (pay === "card" && !ftdReady)}
            className="mt-5 w-full rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
          >
            {submitting ? "Processing…" : `Place order · ${fmt(total)}`}
          </button>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            By placing this order you agree to our terms.
          </p>
        </aside>

        {/* iPOSpays FTD requires a submit button with id payButton in scope */}
        <button id="payButton" type="button" className="hidden" aria-hidden />
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-xl font-bold">{title}</h2>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border py-2.5 font-semibold transition text-sm mx-0 px-0 text-center ${
        active ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground hover:border-primary/50"
      }`}
    >
      {children}
    </button>
  );
}

function PayOption({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition text-center ${
        active ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground hover:border-primary/50"
      }`}
    >
      <span className={active ? "text-primary" : "text-muted-foreground"}>{icon}</span>
      {children}
    </button>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-0.5 text-sm ${bold ? "text-base font-bold" : ""}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
