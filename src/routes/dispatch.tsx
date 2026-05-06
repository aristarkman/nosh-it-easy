import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LOCATIONS, fmt } from "@/lib/order-context";
import { toast } from "sonner";
import { Phone, MapPin, Clock, LogOut, Truck, Check } from "lucide-react";

export const Route = createFileRoute("/dispatch")({
  head: () => ({ meta: [{ title: "Dispatch — The Kosher Nosh" }] }),
  component: DispatchPage,
});

type DStatus = "unassigned" | "assigned" | "out_for_delivery" | "delivered";
type Order = {
  id: string;
  order_number: string;
  location_id: string;
  status: string;
  delivery_status: DStatus | null;
  customer_name: string;
  customer_phone: string;
  delivery_address: string | null;
  total: number;
  driver_id: string | null;
  created_at: string;
};
type Driver = { id: string; name: string; phone: string | null; location_id: string; active: boolean };

function DispatchPage() {
  const nav = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [email, setEmail] = useState("");
  const [locFilter, setLocFilter] = useState<string>("all");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) { nav({ to: "/staff/login" }); return; }
      const uid = s.session.user.id;
      setEmail(s.session.user.email ?? "");
      const [{ data: r }, { data: l }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("staff_locations").select("location_id").eq("user_id", uid),
      ]);
      if (!mounted) return;
      const admin = (r ?? []).some((x) => x.role === "admin");
      setIsAdmin(admin);
      setAllowed(admin ? LOCATIONS.map((x) => x.id) : (l ?? []).map((x) => x.location_id));
      setAuthChecked(true);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) nav({ to: "/staff/login" });
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [nav]);

  useEffect(() => {
    if (!authChecked || allowed.length === 0) return;
    let mounted = true;
    (async () => {
      const [{ data: o }, { data: d }] = await Promise.all([
        supabase
          .from("orders")
          .select("*")
          .eq("order_type", "delivery")
          .in("status", ["new", "accepted", "ready", "completed"])
          .in("location_id", allowed)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase.from("drivers").select("*").eq("active", true).in("location_id", allowed),
      ]);
      if (!mounted) return;
      setOrders((o ?? []) as Order[]);
      setDrivers((d ?? []) as Driver[]);
    })();

    const channel = supabase
      .channel("dispatch")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (p) => {
        setOrders((prev) => {
          if (p.eventType === "INSERT") {
            const n = p.new as Order;
            if (!allowed.includes(n.location_id) || n.order_type !== ("delivery" as unknown as string)) return prev;
            return [n, ...prev];
          }
          if (p.eventType === "UPDATE") {
            const n = p.new as Order;
            return prev.map((x) => (x.id === n.id ? n : x));
          }
          return prev;
        });
      })
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(channel); };
  }, [authChecked, allowed]);

  const filtered = useMemo(() => {
    return orders
      .filter((o) => locFilter === "all" || o.location_id === locFilter)
      .filter((o) => o.delivery_status !== "delivered");
  }, [orders, locFilter]);

  const assignDriver = async (orderId: string, driverId: string | null) => {
    const patch: Partial<Order> = {
      driver_id: driverId,
      delivery_status: driverId ? "assigned" : "unassigned",
    };
    const { error } = await supabase.from("orders").update(patch).eq("id", orderId);
    if (error) toast.error("Could not assign driver");
  };
  const setStatus = async (orderId: string, status: DStatus) => {
    const patch: Record<string, unknown> = { delivery_status: status };
    if (status === "out_for_delivery") patch.dispatched_at = new Date().toISOString();
    if (status === "delivered") {
      patch.delivered_at = new Date().toISOString();
      patch.status = "completed";
    }
    const { error } = await supabase.from("orders").update(patch).eq("id", orderId);
    if (error) toast.error("Update failed");
  };

  if (!authChecked) return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>;
  if (allowed.length === 0)
    return (
      <div className="grid min-h-screen place-items-center bg-muted/40 p-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="font-display text-2xl">No locations assigned</h1>
          <p className="text-sm text-muted-foreground">{email}</p>
        </div>
      </div>
    );

  const visibleLocs = LOCATIONS.filter((l) => allowed.includes(l.id));

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">Dispatch</div>
            <h1 className="font-display text-2xl tracking-wide">Deliveries</h1>
            <div className="text-xs text-muted-foreground">{email}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {visibleLocs.length > 1 && (
              <button
                onClick={() => setLocFilter("all")}
                className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${locFilter === "all" ? "bg-foreground text-background" : "border border-border"}`}
              >
                All
              </button>
            )}
            {visibleLocs.map((l) => (
              <button
                key={l.id}
                onClick={() => setLocFilter(l.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${locFilter === l.id ? "bg-foreground text-background" : "border border-border"}`}
              >
                {l.name}
              </button>
            ))}
            {isAdmin && (
              <Link to="/admin" className="rounded-full border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-wider">
                Admin
              </Link>
            )}
            <Link to="/tablet" className="rounded-full border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-wider">
              Tablet
            </Link>
            <button
              onClick={async () => { await supabase.auth.signOut(); nav({ to: "/staff/login" }); }}
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-wider"
            >
              <LogOut className="size-3.5" /> Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] p-4">
        {filtered.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">No active deliveries.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((o) => {
              const ds = (o.delivery_status ?? "unassigned") as DStatus;
              const locDrivers = drivers.filter((d) => d.location_id === o.location_id);
              return (
                <div key={o.id} className="flex flex-col rounded-2xl border border-border bg-card">
                  <div className="flex items-start justify-between border-b border-border p-4">
                    <div>
                      <div className="font-display text-xl">{o.order_number}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="size-3.5" /> {new Date(o.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        <span>·</span>
                        <span>{LOCATIONS.find((l) => l.id === o.location_id)?.name}</span>
                      </div>
                    </div>
                    <div className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      ds === "unassigned" ? "bg-destructive/10 text-destructive" :
                      ds === "assigned" ? "bg-secondary text-secondary-foreground" :
                      ds === "out_for_delivery" ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                    }`}>
                      {ds.replace(/_/g, " ")}
                    </div>
                  </div>
                  <div className="space-y-1 p-4 text-sm">
                    <div className="font-bold">{o.customer_name}</div>
                    <a href={`tel:${o.customer_phone}`} className="flex items-center gap-1.5 text-foreground">
                      <Phone className="size-3.5 text-muted-foreground" /> {o.customer_phone}
                    </a>
                    <div className="flex items-start gap-1.5">
                      <MapPin className="mt-0.5 size-3.5 text-muted-foreground" />
                      <span>{o.delivery_address}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">Total {fmt(Number(o.total))}</div>
                  </div>
                  <div className="space-y-2 border-t border-border p-3">
                    <select
                      value={o.driver_id ?? ""}
                      onChange={(e) => assignDriver(o.id, e.target.value || null)}
                      className="w-full rounded border border-border bg-background px-2 py-2 text-sm"
                    >
                      <option value="">— Assign driver —</option>
                      {locDrivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <div className="flex gap-2">
                      {ds !== "out_for_delivery" && ds !== "delivered" && (
                        <button
                          disabled={!o.driver_id}
                          onClick={() => setStatus(o.id, "out_for_delivery")}
                          className="flex-1 inline-flex items-center justify-center gap-1 rounded-full bg-foreground px-3 py-2 text-xs font-bold uppercase tracking-wider text-background disabled:opacity-40"
                        >
                          <Truck className="size-3.5" /> Out for delivery
                        </button>
                      )}
                      {ds === "out_for_delivery" && (
                        <button
                          onClick={() => setStatus(o.id, "delivered")}
                          className="flex-1 inline-flex items-center justify-center gap-1 rounded-full bg-primary px-3 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground"
                        >
                          <Check className="size-3.5" /> Delivered
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
