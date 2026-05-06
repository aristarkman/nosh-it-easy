import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LOCATIONS } from "@/lib/order-context";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/throttle")({
  component: ThrottlePage,
});

type Row = {
  location_id: string;
  max_orders_per_15min: number;
  pickup_lead_min: number;
  delivery_lead_min: number;
};

function ThrottlePage() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("location_throttle").select("*");
      setRows((data ?? []) as Row[]);
    })();
  }, []);

  const update = (id: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.location_id === id ? { ...r, ...patch } : r)));
  };

  const save = async () => {
    const { error } = await supabase
      .from("location_throttle")
      .upsert(rows, { onConflict: "location_id" });
    if (error) toast.error("Save failed");
    else toast.success("Pacing saved");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl">Order pacing</h2>
        <button onClick={save} className="rounded-full bg-primary px-4 py-2 text-xs font-black uppercase tracking-wider text-primary-foreground hover:opacity-90">
          Save
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {LOCATIONS.map((l) => {
          const r = rows.find((x) => x.location_id === l.id);
          if (!r) return null;
          return (
            <div key={l.id} className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-display text-xl">{l.name}</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Num label="Max orders / 15min" value={r.max_orders_per_15min}
                  onChange={(v) => update(l.id, { max_orders_per_15min: v })} />
                <Num label="Pickup lead (min)" value={r.pickup_lead_min}
                  onChange={(v) => update(l.id, { pickup_lead_min: v })} />
                <Num label="Delivery lead (min)" value={r.delivery_lead_min}
                  onChange={(v) => update(l.id, { delivery_lead_min: v })} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        className="w-full rounded border border-border bg-background px-2 py-2 text-sm"
      />
    </label>
  );
}
