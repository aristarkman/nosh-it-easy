import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Clock, MapPin, Phone, User, Truck, ShoppingBag, Check, ChefHat, X, LogOut, Volume2, VolumeX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LOCATIONS, fmt, type CartLine } from "@/lib/order-context";
import { sendOrderStatusSms } from "@/server/sms.functions";
import { useNewOrderAlarm } from "@/lib/use-new-order-alarm";
import { toast } from "sonner";

export const Route = createFileRoute("/tablet")({
  head: () => ({
    meta: [{ title: "Order Tablet — The Kosher Nosh" }],
  }),
  component: TabletPage,
});

type Status = "new" | "accepted" | "ready" | "completed" | "cancelled";

type Order = {
  id: string;
  order_number: string;
  location_id: string;
  order_type: "pickup" | "delivery";
  status: Status;
  customer_name: string;
  customer_phone: string;
  delivery_address: string | null;
  when_type: string;
  scheduled_time: string | null;
  payment_method: string;
  total: number;
  items: CartLine[];
  notes: string | null;
  created_at: string;
};

const STATUS_FLOW: Record<Status, { next?: Status; label?: string; color: string }> = {
  new: { next: "accepted", label: "Accept", color: "bg-primary" },
  accepted: { next: "ready", label: "Mark ready", color: "bg-secondary" },
  ready: { next: "completed", label: "Complete", color: "bg-foreground" },
  completed: { color: "bg-muted-foreground" },
  cancelled: { color: "bg-muted-foreground" },
};

function TabletPage() {
  const nav = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [locFilter, setLocFilter] = useState<string>("all");
  const [tab, setTab] = useState<Status>("new");
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [allowedLocations, setAllowedLocations] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");

  // Auth gate + load assigned locations
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        nav({ to: "/staff/login" });
        return;
      }
      const userId = sessionData.session.user.id;
      setUserEmail(sessionData.session.user.email ?? "");

      const [{ data: roles }, { data: locs }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("staff_locations").select("location_id").eq("user_id", userId),
      ]);
      if (!mounted) return;
      const admin = (roles ?? []).some((r) => r.role === "admin");
      setIsAdmin(admin);
      const assigned = (locs ?? []).map((l) => l.location_id);
      setAllowedLocations(admin ? LOCATIONS.map((l) => l.id) : assigned);
      setAuthChecked(true);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) nav({ to: "/staff/login" });
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [nav]);

  useEffect(() => {
    if (!authChecked) return;
    let mounted = true;
    (async () => {
      let q = supabase
        .from("orders")
        .select("*")
        .in("status", ["new", "accepted", "ready"])
        .order("created_at", { ascending: false })
        .limit(200);
      if (!isAdmin && allowedLocations.length > 0) {
        q = q.in("location_id", allowedLocations);
      }
      const { data, error } = await q;
      if (!mounted) return;
      if (error) toast.error("Failed to load orders");
      else setOrders((data ?? []) as unknown as Order[]);
      setLoading(false);
    })();

    const channel = supabase
      .channel("orders-tablet")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          setOrders((prev) => {
            if (payload.eventType === "INSERT") {
              const n = payload.new as Order;
              if (!isAdmin && !allowedLocations.includes(n.location_id)) return prev;
              toast.success(`New order ${n.order_number}`);
              return [n, ...prev];
            }
            if (payload.eventType === "UPDATE") {
              const n = payload.new as Order;
              if (!isAdmin && !allowedLocations.includes(n.location_id)) return prev;
              return prev.map((o) => (o.id === n.id ? n : o));
            }
            if (payload.eventType === "DELETE") {
              const n = payload.old as { id: string };
              return prev.filter((o) => o.id !== n.id);
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [authChecked, isAdmin, allowedLocations]);

  const filtered = useMemo(
    () =>
      orders.filter(
        (o) => (locFilter === "all" || o.location_id === locFilter) && o.status === tab
      ),
    [orders, locFilter, tab]
  );

  const advance = async (o: Order) => {
    const next = STATUS_FLOW[o.status].next;
    if (!next) return;
    const { error } = await supabase.from("orders").update({ status: next }).eq("id", o.id);
    if (error) {
      toast.error("Update failed");
      return;
    }
    if ((next === "accepted" || next === "ready") && o.customer_phone) {
      const locName = LOCATIONS.find((l) => l.id === o.location_id)?.name;
      sendOrderStatusSms({
        data: {
          to: o.customer_phone,
          status: next,
          orderNumber: o.order_number,
          customerName: o.customer_name,
          orderType: o.order_type,
          locationName: locName,
        },
      }).catch((e) => console.error("SMS send failed:", e));
    }
  };
  const cancel = async (o: Order) => {
    const { error } = await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", o.id);
    if (error) toast.error("Cancel failed");
  };

  const counts = useMemo(() => {
    const c: Record<Status, number> = { new: 0, accepted: 0, ready: 0, completed: 0, cancelled: 0 };
    for (const o of orders)
      if (locFilter === "all" || o.location_id === locFilter) c[o.status]++;
    return c;
  }, [orders, locFilter]);

  const { enabled: alarmEnabled, enable: enableAlarm } = useNewOrderAlarm(counts.new);

  if (!authChecked) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>;
  }

  if (allowedLocations.length === 0) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted/40 p-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="font-display text-2xl">No locations assigned</h1>
          <p className="text-sm text-muted-foreground">
            Your account ({userEmail}) is not assigned to any store. Contact your manager.
          </p>
          <button
            onClick={async () => { await supabase.auth.signOut(); nav({ to: "/staff/login" }); }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-bold uppercase tracking-wider"
          >
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
      </div>
    );
  }

  const visibleLocations = LOCATIONS.filter((l) => allowedLocations.includes(l.id));
  const showAllFilter = visibleLocations.length > 1;

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">
              Kitchen Tablet {isAdmin && "· Admin"}
            </div>
            <h1 className="font-display text-2xl tracking-wide">Live Orders</h1>
            <div className="text-xs text-muted-foreground">{userEmail}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {showAllFilter && (
              <Filter
                active={locFilter === "all"}
                onClick={() => setLocFilter("all")}
                label="All"
              />
            )}
            {visibleLocations.map((l) => (
              <Filter
                key={l.id}
                active={locFilter === l.id || (!showAllFilter && locFilter === "all")}
                onClick={() => setLocFilter(l.id)}
                label={l.name}
              />
            ))}
            <button
              onClick={enableAlarm}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                alarmEnabled
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-destructive bg-destructive/10 text-destructive animate-pulse"
              }`}
              title={alarmEnabled ? "Sound on" : "Tap to enable order alerts"}
            >
              {alarmEnabled ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
              {alarmEnabled ? "Alerts on" : "Enable alerts"}
            </button>
            <button
              onClick={async () => { await supabase.auth.signOut(); nav({ to: "/staff/login" }); }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              <LogOut className="size-3.5" /> Sign out
            </button>
          </div>
        </div>
        <div className="mx-auto flex max-w-[1400px] gap-1 px-4">
          {(["new", "accepted", "ready"] as Status[]).map((s) => (
            <button
              key={s}
              onClick={() => setTab(s)}
              className={`relative -mb-px border-b-2 px-4 py-3 text-sm font-bold uppercase tracking-wider transition ${
                tab === s
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {labelFor(s)}
              <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-[11px] font-bold text-background">
                {counts[s]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] p-4">
        {loading ? (
          <div className="py-20 text-center text-muted-foreground">Loading orders…</div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            No {labelFor(tab).toLowerCase()} orders.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((o) => (
              <OrderCard key={o.id} o={o} onAdvance={() => advance(o)} onCancel={() => cancel(o)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function labelFor(s: Status) {
  return s === "new" ? "New" : s === "accepted" ? "In kitchen" : s === "ready" ? "Ready" : s;
}

function Filter({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
        active ? "bg-foreground text-background" : "border border-border bg-background text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function OrderCard({
  o,
  onAdvance,
  onCancel,
}: {
  o: Order;
  onAdvance: () => void;
  onCancel: () => void;
}) {
  const flow = STATUS_FLOW[o.status];
  const loc = LOCATIONS.find((l) => l.id === o.location_id);
  const ago = timeAgo(o.created_at);
  const isNew = o.status === "new";

  return (
    <div
      className={`flex flex-col rounded-2xl border bg-card shadow-sm ${
        isNew ? "border-primary ring-2 ring-primary/20" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-2 border-b border-border p-4">
        <div>
          <div className="font-display text-xl tracking-wide">{o.order_number}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" /> {ago}
            <span>·</span>
            <span>{loc?.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-foreground px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-background">
          {o.order_type === "delivery" ? <Truck className="size-3" /> : <ShoppingBag className="size-3" />}
          {o.order_type}
        </div>
      </div>

      <div className="space-y-1 border-b border-border p-4 text-sm">
        <div className="flex items-center gap-2">
          <User className="size-3.5 text-muted-foreground" /> {o.customer_name}
        </div>
        <div className="flex items-center gap-2">
          <Phone className="size-3.5 text-muted-foreground" />{" "}
          <a href={`tel:${o.customer_phone}`} className="text-foreground">
            {o.customer_phone}
          </a>
        </div>
        {o.delivery_address && (
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-3.5 text-muted-foreground" /> {o.delivery_address}
          </div>
        )}
        <div className="flex items-center gap-2 text-muted-foreground">
          <ChefHat className="size-3.5" />
          {o.when_type === "asap"
            ? "ASAP"
            : o.scheduled_time
              ? new Date(o.scheduled_time).toLocaleString()
              : "Scheduled"}
        </div>
      </div>

      <ul className="flex-1 space-y-2 p-4 text-sm">
        {o.items.map((l) => (
          <li key={l.lineId}>
            <div className="flex justify-between gap-2 font-semibold">
              <span>
                {l.quantity}× {l.name}
              </span>
              <span>{fmt(l.unitPrice * l.quantity)}</span>
            </div>
            {l.modifiers?.length > 0 && (
              <ul className="ml-3 text-xs text-muted-foreground">
                {l.modifiers.map((m) =>
                  m.options.map((opt) => (
                    <li key={`${m.groupId}-${opt.id}`}>+ {opt.name}</li>
                  ))
                )}
              </ul>
            )}
            {l.notes && <div className="ml-3 text-xs italic text-primary">"{l.notes}"</div>}
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-2 border-t border-border p-3">
        <div className="text-sm">
          <span className="text-muted-foreground">Total</span>{" "}
          <span className="font-bold">{fmt(o.total)}</span>{" "}
          <span className="text-xs text-muted-foreground">· {o.payment_method}</span>
        </div>
        <div className="flex gap-1.5">
          {o.status !== "ready" && (
            <button
              onClick={onCancel}
              className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground hover:border-destructive hover:text-destructive"
              aria-label="Cancel order"
            >
              <X className="size-4" />
            </button>
          )}
          {flow.next && (
            <button
              onClick={onAdvance}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition hover:opacity-90 ${flow.color}`}
            >
              <Check className="size-3.5" /> {flow.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function timeAgo(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}
