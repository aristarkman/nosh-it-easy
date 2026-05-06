import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MapPin, Clock, Phone, ArrowRight } from "lucide-react";
import { LOCATIONS, useOrder, type LocationId } from "@/lib/order-context";
import heroImg from "@/assets/hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Choose your location — The Kosher Nosh" },
      {
        name: "description",
        content: "Pick Glen Rock or Cresskill to start your pickup or delivery order.",
      },
    ],
  }),
  component: LocationPick,
});

function LocationPick() {
  const { setLocation, location } = useOrder();
  const navigate = useNavigate();

  const choose = (id: LocationId) => {
    setLocation(id);
    navigate({ to: "/order-type" });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:pt-14">
      <section className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold uppercase tracking-widest text-secondary">
            <span className="size-1.5 rounded-full bg-secondary" /> Now taking online orders
          </span>
          <h1 className="mt-5 font-display text-5xl font-black leading-[1.02] text-foreground sm:text-6xl lg:text-7xl">
            Pastrami,{" "}
            <span className="text-primary">piled high.</span>
            <br />
            Pickled, the right way.
          </h1>
          <p className="mt-5 max-w-lg text-base text-muted-foreground sm:text-lg">
            Two locations. One classic NY Jewish deli. Order pickup or delivery in
            under a minute — no apps, no nonsense.
          </p>
          <div className="mt-8 flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
            <span>Step 1 of 3</span>
            <span className="h-px flex-1 bg-border" />
            <span>Choose location</span>
          </div>
        </div>
        <div className="relative">
          <div className="overflow-hidden rounded-2xl border border-border shadow-[var(--shadow-card)]">
            <img
              src={heroImg}
              alt="The Kosher Nosh deli storefront"
              width={1536}
              height={1024}
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      </section>

      <section className="mt-12 grid gap-4 sm:grid-cols-2">
        {LOCATIONS.map((l) => {
          const active = l.id === location;
          return (
            <button
              key={l.id}
              onClick={() => choose(l.id)}
              className={`group relative overflow-hidden rounded-2xl border bg-card p-6 text-left transition hover:-translate-y-0.5 hover:border-primary hover:shadow-[var(--shadow-pop)] ${
                active ? "border-primary ring-2 ring-primary/30" : "border-border"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-widest text-secondary">
                    The Kosher Nosh
                  </div>
                  <h2 className="mt-1 font-display text-3xl font-black text-foreground">
                    {l.name}
                  </h2>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-secondary">
                  <span className="size-1.5 rounded-full bg-secondary" /> Open
                </span>
              </div>
              <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <MapPin className="size-4 text-primary" /> {l.address}
                </li>
                <li className="flex items-center gap-2">
                  <Clock className="size-4 text-primary" /> {l.hours}
                </li>
                <li className="flex items-center gap-2">
                  <Phone className="size-4 text-primary" /> {l.phone}
                </li>
              </ul>
              <div className="mt-6 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">
                  Order from {l.name}
                </span>
                <ArrowRight className="size-5 text-primary transition group-hover:translate-x-1" />
              </div>
            </button>
          );
        })}
      </section>

      <p className="mt-10 text-center text-xs text-muted-foreground">
        Catering or large orders?{" "}
        <Link to="/" className="underline decoration-primary/40 underline-offset-4 hover:text-primary">
          Call the deli direct
        </Link>
        .
      </p>
    </div>
  );
}
