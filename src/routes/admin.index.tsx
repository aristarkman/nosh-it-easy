import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LOCATIONS, fmt } from "@/lib/order-context";

export const Route = createFileRoute("/admin/")({
  component: AdminOverview,
});

type Stats = {
  todayCount: number;
  todayRevenue: number;
  openCount: number;
  byLocation: Record<string, { count: number; revenue: number }>;
};

function AdminOverview() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("orders")
        .select("location_id,total,status,created_at")
        .gte("created_at", start.toISOString());
      const s: Stats = {
        todayCount: 0,
        todayRevenue: 0,
        openCount: 0,
        byLocation: {},
      };
      for (const o of data ?? []) {
        s.todayCount++;
        s.todayRevenue += Number(o.total);
        if (["new", "accepted", "ready"].includes(o.status as string)) s.openCount++;
        const k = o.location_id as string;
        s.byLocation[k] = s.byLocation[k] ?? { count: 0, revenue: 0 };
        s.byLocation[k].count++;
        s.byLocation[k].revenue += Number(o.total);
      }
      setStats(s);
    })();
  }, []);

  if (!stats) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Orders today" value={String(stats.todayCount)} />
        <Stat label="Revenue today" value={fmt(stats.todayRevenue)} />
        <Stat label="Open right now" value={String(stats.openCount)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {LOCATIONS.map((l) => {
          const s = stats.byLocation[l.id] ?? { count: 0, revenue: 0 };
          return (
            <div key={l.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">
                {l.name}
              </div>
              <div className="mt-1 font-display text-2xl">{l.address}</div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground">Orders today</div>
                  <div className="font-bold">{s.count}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Revenue today</div>
                  <div className="font-bold">{fmt(s.revenue)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-3xl">{value}</div>
    </div>
  );
}
