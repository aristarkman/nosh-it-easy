import { Link, useLocation } from "@tanstack/react-router";
import { ShoppingBag, MapPin, Phone, User } from "lucide-react";
import { useOrder, LOCATIONS } from "@/lib/order-context";
import { useCustomerAuth } from "@/lib/customer-auth";
import noshLogo from "@/assets/nosh-logo.png";

export function SiteHeader() {
  const { location, totalQty } = useOrder();
  const path = useLocation({ select: (l) => l.pathname });
  const loc = LOCATIONS.find((l) => l.id === location);
  const hideOnLanding = path === "/";
  const auth = useCustomerAuth();
  void totalQty;

  return (
    <header className="sticky top-0 z-40 bg-background">
      {/* Announcement bar — koshernosh.com style */}
      <div className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 py-2 text-center text-xs font-semibold tracking-wide sm:text-sm">
          🥳 OUR CRESSKILL STORE IS NOW OPEN 9:00AM ON SATURDAY &amp; SUNDAY!
        </div>
      </div>

      <div className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="font-display text-2xl leading-none tracking-wide text-foreground sm:text-[28px]">
              The <span className="italic">famous</span> Kosher Nosh
            </span>
          </Link>

          <div className="hidden items-center gap-6 md:flex">
            {LOCATIONS.map((l) => (
              <a
                key={l.id}
                href={`tel:${l.phone.replace(/[^\d]/g, "")}`}
                className="flex items-center gap-2 text-sm"
              >
                <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-primary">
                  <Phone className="size-3.5" />
                </span>
                <span className="leading-tight">
                  <span className="block font-bold text-foreground">{l.phone}</span>
                  <span className="block text-xs text-muted-foreground">{l.name}</span>
                </span>
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {!hideOnLanding && loc && (
              <Link
                to="/"
                className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary sm:flex"
              >
                <MapPin className="size-3.5 text-primary" />
                {loc.name}
                <span className="text-muted-foreground">· change</span>
              </Link>
            )}
            <Link
              to={auth.authed ? "/account" : "/login"}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold transition hover:border-primary"
            >
              <User className="size-3.5" />
              <span className="hidden sm:inline">{auth.authed ? "Account" : "Sign in"}</span>
            </Link>
            <a
              href="https://catering.koshernosh.com"
              target="_blank"
              rel="noopener noreferrer"
              className="relative inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-xs font-black uppercase tracking-wider text-primary-foreground shadow-sm transition hover:opacity-90 sm:text-sm"
            >
              <ShoppingBag className="size-4" />
              <span>Order Catering</span>
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
