import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { ShoppingBag, Bike, ArrowLeft } from "lucide-react";
import { LOCATIONS, useOrder, type OrderType } from "@/lib/order-context";

export const Route = createFileRoute("/order-type")({
  head: () => ({
    meta: [
      { title: "Pickup or delivery — The Kosher Nosh" },
      { name: "description", content: "Choose pickup or delivery for your Kosher Nosh order." },
    ],
  }),
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("kn-order-v1");
        const s = raw ? JSON.parse(raw) : null;
        if (!s?.location) throw redirect({ to: "/" });
      } catch (e) {
        if ((e as { isRedirect?: boolean })?.isRedirect) throw e;
      }
    }
  },
  component: OrderTypePick,
});

function OrderTypePick() {
  const { location, setOrderType, orderType } = useOrder();
  const navigate = useNavigate();
  const loc = LOCATIONS.find((l) => l.id === location);

  const choose = (t: OrderType) => {
    setOrderType(t);
    navigate({ to: "/when" });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:pt-14">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-primary"
      >
        <ArrowLeft className="size-4" /> Change location
      </Link>

      <div className="mt-4 flex items-baseline justify-between">
        <h1 className="font-display text-4xl font-black text-foreground sm:text-5xl">
          How are you eating?
        </h1>
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          Step 2 of 3
        </span>
      </div>
      <p className="mt-2 text-muted-foreground">
        Ordering from{" "}
        <span className="font-semibold text-foreground">{loc?.name}</span>
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <TypeCard
          active={orderType === "pickup"}
          onClick={() => choose("pickup")}
          icon={<ShoppingBag className="size-7" />}
          title="Pickup"
          subtitle="Ready in ~15 min"
          line="Pay online or in person. Skip the line."
        />
        <TypeCard
          active={orderType === "delivery"}
          onClick={() => choose("delivery")}
          icon={<Bike className="size-7" />}
          title="Delivery"
          subtitle="Within ~9 miles"
          line="Hot and fast — our driver or partner couriers."
        />
      </div>
    </div>
  );
}

function TypeCard({
  active,
  onClick,
  icon,
  title,
  subtitle,
  line,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  line: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`group rounded-2xl border bg-card p-6 text-left transition hover:-translate-y-0.5 hover:border-primary hover:shadow-[var(--shadow-pop)] ${
        active ? "border-primary ring-2 ring-primary/30" : "border-border"
      }`}
    >
      <div className="inline-flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <h2 className="mt-4 font-display text-3xl font-black">{title}</h2>
      <div className="text-sm font-medium text-secondary">{subtitle}</div>
      <p className="mt-2 text-sm text-muted-foreground">{line}</p>
    </button>
  );
}
