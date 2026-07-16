import { createFileRoute, Link, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowUpDown, LogOut, LayoutDashboard, Clock, CalendarX, Map, Gauge, Truck, Users, Utensils, BookOpen, SlidersHorizontal, Tag, BarChart3, FolderTree, ReceiptText } from "lucide-react";
import { useAdminAuth } from "@/lib/admin-auth";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — The Kosher Nosh" }] }),
  component: AdminLayout,
});

const NAV = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/admin/orders", label: "Orders", icon: ReceiptText },
  { to: "/admin/reports", label: "Reports", icon: BarChart3 },
  { to: "/admin/hours", label: "Hours", icon: Clock },
  { to: "/admin/closures", label: "Closures", icon: CalendarX },
  { to: "/admin/zones", label: "Delivery zones", icon: Map },
  { to: "/admin/throttle", label: "Pacing", icon: Gauge },
  { to: "/admin/drivers", label: "Drivers", icon: Truck },
  { to: "/admin/staff", label: "Staff", icon: Users, adminOnly: true },
  { to: "/admin/menu", label: "Menu items", icon: BookOpen, adminOnly: true },
  { to: "/admin/menu-order", label: "Menu order", icon: ArrowUpDown, adminOnly: true },
  { to: "/admin/categories", label: "Categories", icon: FolderTree, adminOnly: true },
  { to: "/admin/modifiers", label: "Modifications", icon: SlidersHorizontal, adminOnly: true },
  { to: "/admin/biyo", label: "Biyo sync", icon: Utensils, adminOnly: true },
  { to: "/admin/promos", label: "Promo codes", icon: Tag, adminOnly: true },
];

function AdminLayout() {
  const auth = useAdminAuth();
  const nav = useNavigate();
  const path = useLocation({ select: (l) => l.pathname });

  useEffect(() => {
    if (!auth.loading && !auth.authed) nav({ to: "/staff/login" });
  }, [auth.loading, auth.authed, nav]);

  if (auth.loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted/40 p-6 text-center">
        <div className="space-y-4">
          <div className="text-muted-foreground">Loading…</div>
          <button
            onClick={async () => { await auth.signOut(); nav({ to: "/staff/login" }); }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-bold uppercase tracking-wider"
          >
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
      </div>
    );
  }
  if (!auth.authed) return null;

  if (!auth.isAdmin) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted/40 p-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="font-display text-2xl">Admin only</h1>
          <p className="text-sm text-muted-foreground">
            {auth.email} is not an admin. Use the kitchen tablet instead.
          </p>
          <div className="flex justify-center gap-2">
            <Link to="/tablet" className="rounded-full border border-border px-4 py-2 text-xs font-bold uppercase tracking-wider">
              Open tablet
            </Link>
            <button
              onClick={async () => { await auth.signOut(); nav({ to: "/staff/login" }); }}
              className="rounded-full border border-border px-4 py-2 text-xs font-bold uppercase tracking-wider"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">Admin</div>
            <h1 className="font-display text-2xl tracking-wide">The Kosher Nosh</h1>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{auth.email}</span>
            <button
              onClick={async () => { await auth.signOut(); nav({ to: "/staff/login" }); }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-wider hover:text-foreground"
            >
              <LogOut className="size-3.5" /> Sign out
            </button>
          </div>
        </div>
        <div className="mx-auto flex max-w-[1400px] flex-wrap gap-1 px-4">
          {NAV.map((n) => {
            const active = n.exact ? path === n.to : path.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-bold uppercase tracking-wider transition ${
                  active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-3.5" /> {n.label}
              </Link>
            );
          })}
          <Link
            to="/dispatch"
            className="-mb-px inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 py-3 text-sm font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            <Truck className="size-3.5" /> Dispatch
          </Link>
          <Link
            to="/tablet"
            className="-mb-px inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 py-3 text-sm font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            Tablet
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] p-4 lg:p-6">
        <Outlet />
      </div>
    </div>
  );
}
