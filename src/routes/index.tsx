import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MapPin, Clock, Phone, ArrowRight } from "lucide-react";
import { LOCATIONS, useOrder, type LocationId } from "@/lib/order-context";
import { useStoreHours } from "@/lib/use-store-hours";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Order Online — The Famous Kosher Nosh (Glen Rock & Cresskill, NJ)" },
      {
        name: "description",
        content:
          "Order pickup or delivery from The Famous Kosher Nosh. Choose Glen Rock or Cresskill, NJ to browse the full deli menu.",
      },
      { property: "og:title", content: "Order Online — The Famous Kosher Nosh" },
      {
        property: "og:description",
        content: "Pick Glen Rock or Cresskill to start your pickup or delivery order.",
      },
    ],
  }),
  component: LocationPick,
});

function LocationPick() {
  const { setLocation, location } = useOrder();
  const { todayLabel } = useStoreHours();
  const navigate = useNavigate();

  const choose = (id: LocationId) => {
    setLocation(id);
    navigate({ to: "/order-type" });
  };

  return (
    <div>
      {/* Location chooser */}
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-14">
        <div className="mb-8 text-center">
          <span className="text-xs font-bold uppercase tracking-[0.3em] text-primary">
            Order online
          </span>
          <h2 className="mt-2 font-display text-4xl tracking-wide sm:text-5xl">
            Choose your location
          </h2>
        </div>
        <section className="grid gap-4 sm:grid-cols-2">
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
                    <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">
                      The Kosher Nosh
                    </div>
                    <h3 className="mt-1 font-display text-3xl tracking-wide text-foreground">
                      {l.name}
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-background">
                    <span className="size-1.5 rounded-full bg-primary" /> Open
                  </span>
                </div>
                <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <MapPin className="size-4 text-primary" /> {l.address}
                  </li>
                  <li className="flex items-center gap-2">
                    <Clock className="size-4 text-primary" /> {todayLabel(l.id) || l.hours}
                  </li>
                  <li className="flex items-center gap-2">
                    <Phone className="size-4 text-primary" /> {l.phone}
                  </li>
                </ul>
                <div className="mt-6 flex items-center justify-between">
                  <span className="text-sm font-bold uppercase tracking-wider text-foreground">
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
    </div>
  );
}
