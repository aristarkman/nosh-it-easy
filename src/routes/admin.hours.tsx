import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LOCATIONS } from "@/lib/order-context";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/hours")({
  component: HoursPage,
});

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type Kind = "storefront" | "online";
const KINDS: { id: Kind; label: string; hint: string }[] = [
  { id: "storefront", label: "Storefront hours", hint: "When the physical store is open to walk-ins." },
  { id: "online", label: "Online ordering hours", hint: "When customers can place pickup or delivery orders." },
];

type Row = {
  id?: string;
  location_id: string;
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
  hours_kind: Kind;
};

function HoursPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<Kind>("storefront");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("store_hours").select("*");
      const all = (data ?? []) as Row[];
      // Ensure every (location, kind, day) row exists in local state
      const filled: Row[] = [];
      for (const l of LOCATIONS) {
        for (const k of KINDS) {
          for (let d = 0; d < 7; d++) {
            const found = all.find(
              (r) => r.location_id === l.id && r.day_of_week === d && (r.hours_kind ?? "storefront") === k.id
            );
            filled.push(
              found ?? {
                location_id: l.id,
                day_of_week: d,
                open_time: null,
                close_time: null,
                is_closed: true,
                hours_kind: k.id,
              }
            );
          }
        }
      }
      setRows(filled);
    })();
  }, []);

  const update = (loc: string, dow: number, patch: Partial<Row>) => {
    setRows((prev) =>
      prev.map((r) =>
        r.location_id === loc && r.day_of_week === dow && r.hours_kind === kind ? { ...r, ...patch } : r
      )
    );
  };

  const save = async () => {
    setSaving(true);
    const payload = rows.map(({ id: _id, ...r }) => ({
      ...r,
      open_time: r.is_closed ? null : r.open_time,
      close_time: r.is_closed ? null : r.close_time,
    }));
    const { error } = await supabase
      .from("store_hours")
      .upsert(payload, { onConflict: "location_id,hours_kind,day_of_week" });
    setSaving(false);
    if (error) toast.error("Save failed");
    else toast.success("Hours saved");
  };

  const activeKind = KINDS.find((k) => k.id === kind)!;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl">Hours</h2>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-full bg-primary px-4 py-2 text-xs font-black uppercase tracking-wider text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button
            key={k.id}
            onClick={() => setKind(k.id)}
            className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-wider transition ${
              kind === k.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{activeKind.hint}</p>

      <div className="grid gap-4 lg:grid-cols-2">
        {LOCATIONS.map((l) => (
          <div key={l.id} className="rounded-2xl border border-border bg-card p-5">
            <h3 className="font-display text-xl">{l.name}</h3>
            <div className="mt-3 space-y-2">
              {DAYS.map((d, i) => {
                const r = rows.find(
                  (x) => x.location_id === l.id && x.day_of_week === i && x.hours_kind === kind
                );
                if (!r) return null;
                return (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className="w-12 font-bold">{d}</div>
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={r.is_closed}
                        onChange={(e) => update(l.id, i, { is_closed: e.target.checked })}
                      />
                      Closed
                    </label>
                    <input
                      type="time"
                      disabled={r.is_closed}
                      value={r.open_time ?? ""}
                      onChange={(e) => update(l.id, i, { open_time: e.target.value })}
                      className="rounded border border-border bg-background px-2 py-1 disabled:opacity-50"
                    />
                    <span>–</span>
                    <input
                      type="time"
                      disabled={r.is_closed}
                      value={r.close_time ?? ""}
                      onChange={(e) => update(l.id, i, { close_time: e.target.value })}
                      className="rounded border border-border bg-background px-2 py-1 disabled:opacity-50"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
