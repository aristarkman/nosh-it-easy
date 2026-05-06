import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CreditCard, Wallet, Apple, AlertTriangle } from "lucide-react";
import { useOrder, fmt, LOCATIONS } from "@/lib/order-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const PAY_IN_PERSON_THRESHOLD = 100;

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

function CheckoutPage() {
  const navigate = useNavigate();
  const { cart, subtotal, location, orderType, clearCart } = useOrder();
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

  const [zones, setZones] = useState<{ zip: string; fee: number; minimum: number }[]>([]);
  const [closedToday, setClosedToday] = useState<string | null>(null);

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

  const matchedZone = useMemo(
    () => (orderType === "delivery" && zip ? zones.find((z) => z.zip === zip) : undefined),
    [orderType, zip, zones]
  );
  const deliveryFee = orderType === "delivery" ? matchedZone?.fee ?? 0 : 0;
  const tax = +(subtotal * 0.06625).toFixed(2);
  const cardFee = pay === "in-person" ? 0 : +((subtotal + deliveryFee) * 0.03).toFixed(2);
  const total = +(subtotal + deliveryFee + tax + cardFee).toFixed(2);

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
    const { data, error } = await supabase
      .from("orders")
      .insert({
        order_number: orderNumber,
        location_id: location,
        order_type: orderType ?? "pickup",
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        customer_email: email.trim() || null,
        delivery_address: orderType === "delivery" ? address.trim() : null,
        when_type: whenType,
        scheduled_time: whenType === "schedule" && scheduledTime ? scheduledTime : null,
        payment_method: pay,
        subtotal,
        delivery_fee: deliveryFee,
        tax,
        card_fee: cardFee,
        total,
        items: cart,
      })
      .select("order_number")
      .single();

    if (error || !data) {
      console.error(error);
      toast.error("Could not place order. Please try again.");
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
        items: cart,
      })
    );
    clearCart();
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
              <Field
                label="Street address"
                value={address}
                onChange={setAddress}
                placeholder="123 Main St, Apt 4, Glen Rock NJ"
                required
              />
              <p className="text-xs text-muted-foreground">
                Within ~9 mi of {loc?.name}. Delivery is prepaid online.
              </p>
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
          {cardFee > 0 && <Row label="Card processing (3%)" value={fmt(cardFee)} />}
          <Row label="Tax" value={fmt(tax)} />
          <div className="mt-2 border-t border-border pt-2">
            <Row label="Total" value={fmt(total)} bold />
          </div>
          <button
            type="submit"
            disabled={!valid || submitting}
            className="mt-5 w-full rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
          >
            {submitting ? "Placing order…" : `Place order · ${fmt(total)}`}
          </button>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            By placing this order you agree to our terms.
          </p>
        </aside>
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
