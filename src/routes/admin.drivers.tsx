import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LOCATIONS } from "@/lib/order-context";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/admin/drivers")({
  component: DriversPage,
});

type Driver = { id: string; name: string; phone: string | null; location_id: string; active: boolean };

function DriversPage() {
  const [list, setList] = useState<Driver[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loc, setLoc] = useState(LOCATIONS[0].id);

  const load = async () => {
    const { data } = await supabase.from("drivers").select("*").order("name");
    setList((data ?? []) as Driver[]);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim()) return;
    const { error } = await supabase.from("drivers").insert({
      name: name.trim(), phone: phone.trim() || null, location_id: loc, active: true,
    });
    if (error) return toast.error(error.message);
    setName(""); setPhone("");
    load();
  };
  const toggle = async (d: Driver) => {
    await supabase.from("drivers").update({ active: !d.active }).eq("id", d.id);
    load();
  };
  const del = async (id: string) => {
    await supabase.from("drivers").delete().eq("id", id);
    load();
  };

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl">Drivers</h2>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Add driver</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="rounded border border-border bg-background px-2 py-2 text-sm" />
          <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded border border-border bg-background px-2 py-2 text-sm" />
          <select value={loc} onChange={(e) => setLoc(e.target.value)} className="rounded border border-border bg-background px-2 py-2 text-sm">
            {LOCATIONS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button onClick={add} className="rounded-full bg-primary px-4 py-2 text-xs font-black uppercase tracking-wider text-primary-foreground hover:opacity-90">Add</button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Phone</th><th className="px-4 py-2">Location</th><th className="px-4 py-2">Active</th><th /></tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No drivers yet.</td></tr>}
            {list.map((d) => (
              <tr key={d.id} className="border-t border-border">
                <td className="px-4 py-2 font-bold">{d.name}</td>
                <td className="px-4 py-2">{d.phone ?? "—"}</td>
                <td className="px-4 py-2">{LOCATIONS.find((l) => l.id === d.location_id)?.name}</td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => toggle(d)}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${d.active ? "bg-foreground text-background" : "border border-border text-muted-foreground"}`}
                  >
                    {d.active ? "Active" : "Off"}
                  </button>
                </td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => del(d.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
