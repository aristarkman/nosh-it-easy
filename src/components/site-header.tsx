import { Link, useLocation } from "@tanstack/react-router";
import { ShoppingBag, MapPin } from "lucide-react";
import { useOrder, LOCATIONS } from "@/lib/order-context";

export function SiteHeader() {
  const { location, totalQty } = useOrder();
  const path = useLocation({ select: (l) => l.pathname });
  const loc = LOCATIONS.find((l) => l.id === location);
  const hideOnLanding = path === "/";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="h-1.5 deli-stripe" />
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="flex items-baseline gap-2">
          <span className="font-display text-2xl font-black tracking-tight text-primary">
            The Kosher Nosh
          </span>
          <span className="hidden text-xs uppercase tracking-[0.2em] text-muted-foreground sm:inline">
            est. 1985
          </span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-4">
          {!hideOnLanding && loc && (
            <Link
              to="/"
              className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary sm:flex"
            >
              <MapPin className="size-3.5 text-primary" />
              {loc.name}
              <span className="text-muted-foreground">· change</span>
            </Link>
          )}
          <Link
            to="/cart"
            className="relative inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
          >
            <ShoppingBag className="size-4" />
            <span>Cart</span>
            {totalQty > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-foreground px-1.5 text-[11px] font-bold text-primary">
                {totalQty}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
