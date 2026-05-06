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
    <div>
      {/* Hero — black, bold display, image right (koshernosh.com vibe) */}
      <section className="relative overflow-hidden bg-[oklch(0.14_0_0)] text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-24">
          <div>
            <h1 className="font-display text-5xl leading-[0.95] tracking-wide text-white sm:text-7xl lg:text-[88px]">
              Serving the<br />
              Kosher Way<br />
              Since <span className="text-primary">1976</span>
            </h1>
            <p className="mt-6 max-w-md text-base text-white/75 sm:text-lg">
              Indulge in authentic Kosher catering and delicatessen. A delightful
              family dining experience with exceptional catering for homes,
              hotels, temples, and synagogues.
            </p>
            <div className="mt-8 h-px w-24 bg-primary" />
            <div className="mt-8 flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-white/60">
              <span>Step 1 of 3</span>
              <span className="h-px w-8 bg-white/20" />
              <span>Choose location</span>
            </div>
          </div>
          <div className="relative">
            <img
              src={heroImg}
              alt="Pastrami sandwich, piled high"
              width={1536}
              height={1024}
              className="h-full w-full rounded-2xl object-cover shadow-[var(--shadow-pop)]"
            />
          </div>
        </div>
        {/* Red kosher supervision strip */}
        <div className="bg-primary text-primary-foreground">
          <div className="mx-auto max-w-6xl px-4 py-3 text-center text-xs font-bold uppercase tracking-[0.2em] sm:text-sm">
            Under the supervision of Rabbi Dr. Bernhard Rosenberg — BEHR Kosher Supervision
          </div>
        </div>
      </section>

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
                    <Clock className="size-4 text-primary" /> {l.hours}
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
