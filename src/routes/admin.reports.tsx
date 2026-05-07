import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LOCATIONS, fmt, type CartLine } from "@/lib/order-context";

export const Route = createFileRoute("/admin/reports")({
  component: ReportsPage,
});

type OrderRow = {
  id: string;
  total: number;
  subtotal: number;
  status: string;
  location_id: string;
  channel: string;
  created_at: string;
  items: CartLine[];
};

function ReportsPage() {
  const [days, setDays] = useState(7);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [carts, setCarts] = useState<{ recovered: boolean; created_at: string; subtotal: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      const [{ data: o }, { data: c }] = await Promise.all([
        supabase
          .from("orders")
          .select("id,total,subtotal,status,location_id,channel,created_at,items")
          .gte("created_at", since)
          .order("created_at", { ascending: false }),
        supabase
          .from("abandoned_carts")
          .select("recovered,created_at,subtotal")
          .gte("created_at", since),
      ]);
      setOrders((o ?? []) as never);
      setCarts((c ?? []) as never);
      setLoading(false);
    })();
  }, [days]);

  const stats = useMemo(() => {
    const total = orders.reduce((s, o) => s + Number(o.total), 0);
    const aov = orders.length ? total / orders.length : 0;
    const byDay: Record<string, { count: number; revenue: number }> = {};
    const byLocation: Record<string, { count: number; revenue: number }> = {};
    const byChannel: Record<string, { count: number; revenue: number }> = {};
    const itemMap: Record<string, { name: string; qty: number; revenue: number }> = {};
    for (const o of orders) {
      const day = o.created_at.slice(0, 10);
      byDay[day] = byDay[day] ?? { count: 0, revenue: 0 };
      byDay[day].count++;
      byDay[day].revenue += Number(o.total);
      byLocation[o.location_id] = byLocation[o.location_id] ?? { count: 0, revenue: 0 };
      byLocation[o.location_id].count++;
      byLocation[o.location_id].revenue += Number(o.total);
      const ch = o.channel ?? "web";
      byChannel[ch] = byChannel[ch] ?? { count: 0, revenue: 0 };
      byChannel[ch].count++;
      byChannel[ch].revenue += Number(o.total);
      for (const line of o.items ?? []) {
        const k = line.itemId;
        itemMap[k] = itemMap[k] ?? { name: line.name, qty: 0, revenue: 0 };
        itemMap[k].qty += line.quantity;
        itemMap[k].revenue += line.unitPrice * line.quantity;
      }
    }
    const topItems = Object.values(itemMap).sort((a, b) => b.qty - a.qty).slice(0, 10);
    const totalCarts = carts.length;
    const recovered = carts.filter((c) => c.recovered).length;
    const abandonRate = totalCarts ? (1 - recovered / totalCarts) * 100 : 0;
    return { total, aov, byDay, byLocation, byChannel, topItems, totalCarts, recovered, abandonRate };
  }, [orders, carts]);

  if (loading) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Reports</h1>
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

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Orders" value={String(orders.length)} />
        <Stat label="Revenue" value={fmt(stats.total)} />
        <Stat label="AOV" value={fmt(stats.aov)} />
        <Stat label="Cart abandon rate" value={`${stats.abandonRate.toFixed(0)}%`} sub={`${stats.recovered}/${stats.totalCarts} recovered`} />
      </div>

      <Section title="Daily sales">
        <SimpleTable
          rows={Object.entries(stats.byDay).sort(([a], [b]) => b.localeCompare(a)).map(([d, v]) => [d, String(v.count), fmt(v.revenue)])}
          head={["Day", "Orders", "Revenue"]}
        />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="By location">
          <SimpleTable
            rows={LOCATIONS.map((l) => {
              const v = stats.byLocation[l.id] ?? { count: 0, revenue: 0 };
              return [l.name, String(v.count), fmt(v.revenue)];
            })}
            head={["Location", "Orders", "Revenue"]}
          />
        </Section>
        <Section title="By channel">
          <SimpleTable
            rows={Object.entries(stats.byChannel).map(([c, v]) => [c, String(v.count), fmt(v.revenue)])}
            head={["Channel", "Orders", "Revenue"]}
          />
        </Section>
      </div>

      <Section title="Top 10 items">
        <SimpleTable
          rows={stats.topItems.map((i) => [i.name, String(i.qty), fmt(i.revenue)])}
          head={["Item", "Sold", "Revenue"]}
        />
      </Section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-xl">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {head.map((h) => <th key={h} className="py-2 pr-4">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={head.length} className="py-3 text-muted-foreground">No data.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50">
              {r.map((c, j) => <td key={j} className="py-2 pr-4">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
