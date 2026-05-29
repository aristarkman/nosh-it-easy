import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, ChevronRight, Flame } from "lucide-react";
import { LOCATIONS, useOrder, fmt } from "@/lib/order-context";
import { getMenu } from "@/lib/menu.functions";
import { thumb } from "@/lib/image-url";
import type { Category } from "@/lib/menu-types";

export const Route = createFileRoute("/menu")({
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
        const raw = localStorage.getItem("kn-order-v1");
        const s = raw ? JSON.parse(raw) : null;
        if (!s?.location) throw redirect({ to: "/" });
        if (!s?.orderType) throw redirect({ to: "/order-type" });
      } catch (e) {
        if ((e as { isRedirect?: boolean })?.isRedirect) throw e;
      }
    }
  },
  loader: () => getMenu(),
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
  const [active, setActive] = useState(categories[0]?.id ?? "");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const s = q.toLowerCase();
    return items.filter(
      (i) => i.name.toLowerCase().includes(s) || i.description.toLowerCase().includes(s)
    );
  }, [q, items]);

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
                · {loc?.hours}
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
            placeholder="Search the menu — pastrami, knish, soup…"
            className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-primary"
          />
        </div>
      </div>

      <div className="sticky top-[68px] z-30 mt-4 -mx-4 overflow-x-auto border-b border-border bg-background/85 px-4 backdrop-blur">
        <div className="flex gap-1 py-2">
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
              {catItems.map((i) => (
                <li key={i.id}>
                  <Link
                    to="/item/$itemId"
                    params={{ itemId: i.id }}
                    className="group flex items-start gap-4 rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-[var(--shadow-card)]"
                  >
                    {i.image ? (
                      <img
                        src={i.image}
                        alt={i.name}
                        loading="lazy"
                        className="size-24 shrink-0 rounded-xl object-cover sm:size-28"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold normal-case tracking-tight text-foreground" style={{ fontFamily: "var(--font-body)" }}>
                          {i.name}
                        </h3>
                        {i.popular && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                            <Flame className="size-3" /> Popular
                          </span>
                        )}
                        {i.soldOut && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Sold out
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
