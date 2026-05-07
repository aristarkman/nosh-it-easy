import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CreditCard, Wallet, Apple, AlertTriangle, Lock } from "lucide-react";
import { useOrder, fmt, LOCATIONS } from "@/lib/order-context";
import { useCustomerAuth } from "@/lib/customer-auth";
import { supabase } from "@/integrations/supabase/client";
import { chargeWithToken, getFtdConfig } from "@/server/ipospays.functions";
import { sendOrderStatusSms, sendStaffNewOrderAlert } from "@/server/sms.functions";
import { toast } from "sonner";

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

  const [zones, setZones] = useState<{ zip: string; fee: number; minimum: number }[]>([]);
  const [closedToday, setClosedToday] = useState<string | null>(null);

  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddrId, setSelectedAddrId] = useState<string>("");

  const [ftdReady, setFtdReady] = useState(false);
  const ftdLoadedRef = useRef(false);

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
      const [{ data: z }, { data: c }] = await Promise.all([
        supabase.from("delivery_zones").select("zip,fee,minimum").eq("location_id", location),
        supabase
          .from("store_closures")
          .select("reason,location_id,start_date,end_date")
          .lte("start_date", today)
          .gte("end_date", today),
      ]);
      setZones((z ?? []).map((x) => ({ zip: x.zip, fee: Number(x.fee), minimum: Number(x.minimum) })));
      const hit = (c ?? []).find((x) => x.location_id === null || x.location_id === location);
      setClosedToday(hit ? hit.reason ?? "Closed today" : null);
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

  const matchedZone = useMemo(
    () => (orderType === "delivery" && zip ? zones.find((z) => z.zip === zip) : undefined),
    [orderType, zip, zones]
  );
  const deliveryFee = orderType === "delivery" ? matchedZone?.fee ?? 0 : 0;

  const tipAmount = useMemo(() => {
    if (tipMode === "none") return 0;
    if (tipMode === "custom") {
      const n = parseFloat(tipCustom);
      return isNaN(n) || n < 0 ? 0 : +n.toFixed(2);
    }
    return +(subtotal * tipPreset).toFixed(2);
  }, [tipMode, tipPreset, tipCustom, subtotal]);

  const tax = +(subtotal * 0.06625).toFixed(2);
  const cardFee = pay === "in-person" ? 0 : +((subtotal + deliveryFee) * 0.03).toFixed(2);
  const total = +(subtotal + deliveryFee + tax + tipAmount + cardFee).toFixed(2);

  const canPayInPerson = orderType === "pickup" && subtotal < PAY_IN_PERSON_THRESHOLD;
  const zoneOk = orderType !== "delivery" || (!!matchedZone && subtotal >= matchedZone.minimum);
  const minShortfall = orderType === "delivery" && matchedZone ? matchedZone.minimum - subtotal : 0;

  const valid =
    !closedToday &&
    name.trim().length > 1 &&
    /^[\d\s()+-]{7,}$/.test(phone) &&
    (orderType === "pickup" || (address.trim().length > 5 && zoneOk));

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
        notes: Object.keys(paymentMeta).length
          ? `tip:${tipAmount.toFixed(2)} | ${JSON.stringify(paymentMeta)}`
          : `tip:${tipAmount.toFixed(2)}`,
      })
      .select("order_number")
      .single();

    if (error || !data) {
      console.error(error);
      toast.error(
        pay === "card"
          ? "Payment captured but order could not be saved. Please call us."
          : "Could not place order. Please try again."
      );
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
              {zip.length === 5 && !matchedZone && (
                <p className="text-xs text-destructive">
                  Sorry — we don't deliver to {zip} from {loc?.name}. Try pickup instead.
                </p>
              )}
              {matchedZone && !zoneOk && (
                <p className="text-xs text-destructive">
                  ${minShortfall.toFixed(2)} below the {fmt(matchedZone.minimum)} delivery minimum for this ZIP.
                </p>
              )}
              {matchedZone && zoneOk && (
                <p className="text-xs text-muted-foreground">
                  Delivery to {zip}: {fmt(matchedZone.fee)} fee · {fmt(matchedZone.minimum)} minimum.
                </p>
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
            </Section>
          )}

          <Section title="Add a tip">
            <p className="text-xs text-muted-foreground">
              100% of tips go to our team.
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
      className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
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
      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition ${
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
