import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, ChevronRight, Flame, WheatOff } from "lucide-react";
import { LOCATIONS, useOrder, fmt } from "@/lib/order-context";
import { menuItemAlt } from "@/lib/alt-text";
import { getMenu } from "@/lib/menu.functions";
import { thumb } from "@/lib/image-url";
import type { Category } from "@/lib/menu-types";
import { useStoreHours } from "@/lib/use-store-hours";
import { soldOutLabel } from "@/lib/sold-out";

function readLocationFromStorage(): string {
  if (typeof window === "undefined") return "cresskill";
  try {
    const raw = localStorage.getItem("kn-order") ?? localStorage.getItem("kn-order-v1");
    const parsed = raw ? JSON.parse(raw) : null;
    const s = parsed?.state ?? parsed;
    return s?.location ?? "cresskill";
  } catch {
    return "cresskill";
  }
}

export const Route = createFileRoute("/menu")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Menu — The Famous Kosher Nosh | Glen Rock & Cresskill, NJ" },
      {
        name: "description",
        content:
          "Browse the full Kosher Nosh deli menu and order pickup or delivery in Glen Rock & Cresskill, NJ.",
      },
      { property: "og:title", content: "The Famous Kosher Nosh — Menu" },
      { property: "og:description", content: "Browse the full deli menu and order online." },
    ],
  }),
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("kn-order") ?? localStorage.getItem("kn-order-v1");
        const parsed = raw ? JSON.parse(raw) : null;
        const s = parsed?.state ?? parsed;
        if (!s?.location) throw redirect({ to: "/" });
        if (!s?.orderType) throw redirect({ to: "/order-type" });
        if (!s?.whenType) throw redirect({ to: "/when" });
      } catch (e) {
        if ((e as { isRedirect?: boolean })?.isRedirect) throw e;
      }
    }
  },
  loader: () => getMenu({ data: { locationId: readLocationFromStorage() } }),
  errorComponent: () => (
    <div className="mx-auto max-w-md p-10 text-center">
      <p>Could not load the menu. Please try again in a moment.</p>
    </div>
  ),
  component: MenuPage,
});


function MenuPage() {
  const { items, categories } = Route.useLoaderData() as { items: import("@/lib/menu-types").MenuItem[]; categories: Category[] };
  const { location, orderType } = useOrder();
  const loc = LOCATIONS.find((l) => l.id === location);
  const { todayLabel } = useStoreHours();
  const [active, setActive] = useState(categories[0]?.id ?? "");
  const [q, setQ] = useState("");
  const [gfOnly, setGfOnly] = useState(false);

  const filtered = useMemo(() => {
    let list = items;
    if (gfOnly) list = list.filter((i) => i.glutenFreePossible);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter(
        (i) => i.name.toLowerCase().includes(s) || i.description.toLowerCase().includes(s)
      );
    }
    return list;
  }, [q, items, gfOnly]);

  useEffect(() => {
    const onScroll = () => {
      for (const c of categories) {
        const el = document.getElementById(`cat-${c.id}`);
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.top < 140 && r.bottom > 140) {
            setActive(c.id);
            break;
          }
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [categories]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(`cat-${id}`);
    if (el) window.scrollTo({ top: el.offsetTop - 120, behavior: "smooth" });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-secondary">
              {orderType === "delivery" ? "Delivering from" : "Pickup at"}
            </div>
            <h1 className="font-display text-3xl font-black sm:text-4xl">
              {loc?.name}{" "}
              <span className="text-base font-medium text-muted-foreground">
                · {(location && todayLabel(location)) || loc?.hours}
              </span>
            </h1>
          </div>
          <Link
            to="/order-type"
            className="text-sm font-medium text-primary underline decoration-primary/30 underline-offset-4"
          >
            Change
          </Link>
        </div>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search the menu"
            placeholder="Search the menu — pastrami, knish, soup…"
            className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-primary"
          />
        </div>
      </div>

      <div className="sticky top-[68px] z-30 mt-4 -mx-4 overflow-x-auto border-b border-border bg-background/85 px-4 backdrop-blur">
        <div className="flex gap-1 py-2">
          <button
            onClick={() => setGfOnly((v) => !v)}
            aria-pressed={gfOnly}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
              gfOnly
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <WheatOff className="size-3.5" /> GF Possible
          </button>
          {categories.map((c) => {
            if (!filtered.some((i) => i.category === c.id)) return null;
            return (
              <button
                key={c.id}
                onClick={() => scrollTo(c.id)}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                  active === c.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </div>

      {gfOnly && (
        <div className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Our kitchen is not entirely gluten free — we use many non-gluten free products. Gluten free preparation is available upon request but cross-contamination is possible. Please inform us of any severe allergies.
        </div>
      )}

      {gfOnly && filtered.length === 0 && (
        <div className="mt-6 rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No gluten free possible items — try another category or call the deli directly.
        </div>
      )}

      {categories.map((c) => {
        const catItems = filtered.filter((i) => i.category === c.id);
        if (!catItems.length) return null;
        return (
          <section key={c.id} id={`cat-${c.id}`} className="mt-10 scroll-mt-32">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="font-display text-2xl font-black sm:text-3xl">{c.name}</h2>
              {c.blurb && (
                <span className="hidden text-sm italic text-muted-foreground sm:inline">
                  {c.blurb}
                </span>
              )}
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {catItems.map((i, idx) => (
                <li key={i.id}>
                  <Link
                    to="/item/$slug"
                    params={{ slug: i.slug }}
                    className="group flex items-start gap-4 rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-[var(--shadow-card)]"
                  >
                    {i.image ? (
                      <img
                        src={thumb(i.image, 224)}
                        alt={menuItemAlt(i.name, location)}
                        width={112}
                        height={112}
                        loading={idx < 4 ? "eager" : "lazy"}
                        fetchPriority={idx < 2 ? "high" : "auto"}
                        decoding="async"
                        className="size-24 shrink-0 rounded-xl bg-muted object-contain sm:size-28"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold normal-case tracking-tight text-foreground" style={{ fontFamily: "var(--font-body)" }}>
                          {i.name}
                        </h3>
                        {i.popular && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                            <Flame className="size-3" /> Popular
                          </span>
                        )}
                        {i.glutenFreePossible && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                            <WheatOff className="size-3" /> GF Possible
                          </span>
                        )}
                        {i.soldOut && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            {soldOutLabel(i.soldOutUntil)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {i.description}
                      </p>
                      <div className="mt-3 flex items-center gap-3">
                        <span className="font-semibold text-foreground">
                          {fmt(i.price)}
                        </span>
                        <span className="text-xs font-medium text-primary opacity-0 transition group-hover:opacity-100">
                          Customize →
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
                  </Link>
                </li>
              ))}

            </ul>
          </section>
        );
      })}
    </div>
  );
}
