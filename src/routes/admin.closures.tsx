import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LOCATIONS } from "@/lib/order-context";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/admin/closures")({
  component: ClosuresPage,
});

type Closure = {
  id: string;
  location_id: string | null;
  start_date: string;
  end_date: string;
  reason: string | null;
};

function ClosuresPage() {
  const [list, setList] = useState<Closure[]>([]);
  const [loc, setLoc] = useState<string>("all");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");

  const load = async () => {
    const { data } = await supabase
      .from("store_closures")
      .select("*")
      .order("start_date", { ascending: true });
    setList((data ?? []) as Closure[]);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!start || !end) return toast.error("Pick dates");
    const { error } = await supabase.from("store_closures").insert({
      location_id: loc === "all" ? null : loc,
      start_date: start,
      end_date: end,
      reason: reason || null,
    });
    if (error) return toast.error(error.message);
    setStart(""); setEnd(""); setReason(""); setLoc("all");
    load();
  };
  const del = async (id: string) => {
    await supabase.from("store_closures").delete().eq("id", id);
    load();
  };

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl">Holidays & closures</h2>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Add closure</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-5">
          <select value={loc} onChange={(e) => setLoc(e.target.value)} className="rounded border border-border bg-background px-2 py-2 text-sm">
            <option value="all">All locations</option>
            {LOCATIONS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded border border-border bg-background px-2 py-2 text-sm" />
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded border border-border bg-background px-2 py-2 text-sm" />
          <input placeholder="Reason (e.g. Passover)" value={reason} onChange={(e) => setReason(e.target.value)} className="rounded border border-border bg-background px-2 py-2 text-sm sm:col-span-1" />
          <button onClick={add} className="rounded-full bg-primary px-4 py-2 text-xs font-black uppercase tracking-wider text-primary-foreground hover:opacity-90">Add</button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-4 py-2">Location</th><th className="px-4 py-2">Start</th><th className="px-4 py-2">End</th><th className="px-4 py-2">Reason</th><th /></tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No closures scheduled.</td></tr>
            )}
            {list.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-4 py-2">{c.location_id ? LOCATIONS.find((l) => l.id === c.location_id)?.name : "All"}</td>
                <td className="px-4 py-2">{c.start_date}</td>
                <td className="px-4 py-2">{c.end_date}</td>
                <td className="px-4 py-2">{c.reason ?? "—"}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => del(c.id)} className="text-muted-foreground hover:text-destructive">
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
