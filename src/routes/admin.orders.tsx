import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LOCATIONS, fmt, type CartLine } from "@/lib/order-context";
import { RefundDialog } from "@/components/refund-dialog";
import { RotateCcw, Search, ChevronDown, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/admin/orders")({
  head: () => ({ meta: [{ title: "Orders — Admin" }] }),
  component: AdminOrdersPage,
});

type Order = {
  id: string;
  order_number: string;
  location_id: string;
  order_type: "pickup" | "delivery";
  status: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string | null;
  payment_method: string;
  total: number;
  subtotal: number;
  items: CartLine[];
  created_at: string;
  refunded_total: number;
  refund_status: "none" | "partial" | "full" | "voided";
};

const STATUSES = ["all", "new", "accepted", "ready", "completed", "cancelled"] as const;

function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [locFilter, setLocFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUSES)[number]>("all");
  const [search, setSearch] = useState("");
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    (async () => {
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      if (!error) setOrders((data ?? []) as unknown as Order[]);
      setLoading(false);
    })();

    const channel = supabase
      .channel("admin-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (p) => {
        setOrders((prev) => {
          if (p.eventType === "UPDATE") {
            const n = p.new as Order;
            return prev.map((o) => (o.id === n.id ? n : o));
          }
          if (p.eventType === "INSERT") {
            const n = p.new as Order;
            return [n, ...prev];
          }
          return prev;
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [days]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (locFilter !== "all" && o.location_id !== locFilter) return false;
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (q) {
        const hay = `${o.order_number} ${o.customer_name} ${o.customer_phone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, locFilter, statusFilter, search]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Orders</h1>
        <div className="flex gap-1 rounded-full border border-border bg-card p-1">
          {[1, 7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${
                days === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {d === 1 ? "Today" : `${d}d`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by order #, name, or phone"
            className="w-full rounded-full border border-border bg-card py-2 pl-9 pr-4 text-sm"
          />
        </div>
        <select
          value={locFilter}
          onChange={(e) => setLocFilter(e.target.value)}
          className="rounded-full border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="all">All locations</option>
          {LOCATIONS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as (typeof STATUSES)[number])}
          className="rounded-full border border-border bg-card px-3 py-2 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All statuses" : s}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No orders match.</div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((o) => {
              const canRefund =
                (o.refunded_total ?? 0) < Number(o.total) && o.refund_status !== "voided";
              const isOpen = expanded.has(o.id);
              const loc = LOCATIONS.find((l) => l.id === o.location_id);
              return (
                <div key={o.id}>
                  <div className="flex flex-wrap items-center gap-3 p-3 text-sm">
                    <button
                      onClick={() => toggle(o.id)}
                      className="grid size-7 place-items-center rounded hover:bg-muted"
                      aria-label="Toggle details"
                    >
                      {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </button>
                    <div className="w-20 font-display text-lg">{o.order_number}</div>
                    <div className="w-32 text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <div className="w-24 text-xs uppercase tracking-wider text-muted-foreground">
                      {loc?.name}
                    </div>
                    <div className="w-20 text-xs uppercase tracking-wider text-muted-foreground">
                      {o.order_type}
                    </div>
                    <div className="flex-1 min-w-[140px]">
                      <div className="font-semibold">{o.customer_name}</div>
                      <a href={`tel:${o.customer_phone}`} className="text-xs text-muted-foreground">
                        {o.customer_phone}
                      </a>
                    </div>
                    <div className="w-24">
                      <StatusPill status={o.status} />
                    </div>
                    <div className="w-24 text-right">
                      <div className="font-bold">{fmt(Number(o.total))}</div>
                      {(o.refunded_total ?? 0) > 0 && (
                        <div className="text-[10px] font-bold uppercase tracking-wider text-destructive">
                          {o.refund_status === "voided"
                            ? "Voided"
                            : o.refund_status === "full"
                              ? "Refunded"
                              : `-${fmt(Number(o.refunded_total))}`}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setRefundOrder(o)}
                      disabled={!canRefund}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-wider hover:border-destructive hover:text-destructive disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted-foreground"
                    >
                      <RotateCcw className="size-3.5" /> Refund
                    </button>
                  </div>
                  {isOpen && (
                    <div className="border-t border-border bg-muted/30 p-4 text-sm">
                      {o.delivery_address && (
                        <div className="mb-2 text-xs text-muted-foreground">
                          Delivery: {o.delivery_address}
                        </div>
                      )}
                      <ul className="space-y-2">
                        {o.items.map((l) => (
                          <li key={l.lineId}>
                            <div className="flex justify-between font-semibold">
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
                                  )),
                                )}
                              </ul>
                            )}
                            {l.notes && (
                              <div className="ml-3 text-xs italic text-primary">"{l.notes}"</div>
                            )}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 flex justify-between border-t border-border pt-2 text-xs text-muted-foreground">
                        <span>Payment: {o.payment_method}</span>
                        <span>Subtotal {fmt(Number(o.subtotal))}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {refundOrder && (
        <RefundDialog
          open={!!refundOrder}
          onClose={() => setRefundOrder(null)}
          order={refundOrder}
        />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    new: "bg-primary/10 text-primary",
    accepted: "bg-secondary text-secondary-foreground",
    ready: "bg-foreground/10 text-foreground",
    completed: "bg-muted text-muted-foreground",
    cancelled: "bg-destructive/10 text-destructive",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
        map[status] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {status}
    </span>
  );
}
