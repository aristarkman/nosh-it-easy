import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LOCATIONS, fmt } from "@/lib/order-context";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/admin/zones")({
  component: ZonesPage,
});

type Zone = { id: string; location_id: string; zip: string; fee: number; minimum: number };

function ZonesPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loc, setLoc] = useState<string>(LOCATIONS[0].id);
  const [zip, setZip] = useState("");
  const [fee, setFee] = useState("4.99");
  const [min, setMin] = useState("20");

  const load = async () => {
    const { data } = await supabase
      .from("delivery_zones")
      .select("*")
      .order("location_id")
      .order("zip");
    setZones((data ?? []) as Zone[]);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!/^\d{5}$/.test(zip)) return toast.error("Enter a 5-digit ZIP");
    const { error } = await supabase.from("delivery_zones").insert({
      location_id: loc,
      zip,
      fee: parseFloat(fee) || 0,
      minimum: parseFloat(min) || 0,
    });
    if (error) return toast.error(error.message);
    setZip("");
    load();
  };
  const del = async (id: string) => {
    await supabase.from("delivery_zones").delete().eq("id", id);
    load();
  };

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl">Delivery zones</h2>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Add ZIP</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-5">
          <select value={loc} onChange={(e) => setLoc(e.target.value)} className="rounded border border-border bg-background px-2 py-2 text-sm">
            {LOCATIONS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <input placeholder="ZIP" value={zip} onChange={(e) => setZip(e.target.value)} className="rounded border border-border bg-background px-2 py-2 text-sm" />
          <input placeholder="Fee" value={fee} onChange={(e) => setFee(e.target.value)} className="rounded border border-border bg-background px-2 py-2 text-sm" />
          <input placeholder="Minimum" value={min} onChange={(e) => setMin(e.target.value)} className="rounded border border-border bg-background px-2 py-2 text-sm" />
          <button onClick={add} className="rounded-full bg-primary px-4 py-2 text-xs font-black uppercase tracking-wider text-primary-foreground hover:opacity-90">Add</button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {LOCATIONS.map((l) => {
          const list = zones.filter((z) => z.location_id === l.id);
          return (
            <div key={l.id} className="rounded-2xl border border-border bg-card">
              <div className="border-b border-border px-5 py-3 font-display text-lg">{l.name}</div>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr><th className="px-4 py-2">ZIP</th><th className="px-4 py-2">Fee</th><th className="px-4 py-2">Min</th><th /></tr>
                </thead>
                <tbody>
                  {list.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No ZIPs configured.</td></tr>}
                  {list.map((z) => (
                    <tr key={z.id} className="border-t border-border">
                      <td className="px-4 py-2 font-mono">{z.zip}</td>
                      <td className="px-4 py-2">{fmt(Number(z.fee))}</td>
                      <td className="px-4 py-2">{fmt(Number(z.minimum))}</td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={() => del(z.id)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
