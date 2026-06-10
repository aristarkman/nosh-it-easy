import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { syncBiyoNow } from "@/lib/biyo-sync.functions";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/admin/biyo")({
  head: () => ({ meta: [{ title: "Biyo sync — Admin" }] }),
  component: BiyoAdmin,
});

type LocRow = { location_id: string; biyo_store_id: string; display_name: string | null };
type LogRow = {
  id: string;
  started_at: string;
  finished_at: string | null;
  items_upserted: number | null;
  prices_upserted: number | null;
  status: string;
  error: string | null;
};

function BiyoAdmin() {
  const [locs, setLocs] = useState<LocRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const sync = useServerFn(syncBiyoNow);

  async function load() {
    setLoading(true);
    const [{ data: l }, { data: s }] = await Promise.all([
      supabase.from("biyo_locations").select("*").order("location_id"),
      supabase.from("menu_sync_log").select("*").order("started_at", { ascending: false }).limit(10),
    ]);
    setLocs((l ?? []) as LocRow[]);
    setLogs((s ?? []) as LogRow[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function updateStore(location_id: string, biyo_store_id: string) {
    const { error } = await supabase
      .from("biyo_locations")
      .update({ biyo_store_id })
      .eq("location_id", location_id);
    if (error) setErr(error.message);
    else load();
  }

  async function runSync() {
    setSyncing(true); setResult(null); setErr(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) { setErr("Please sign in again."); setSyncing(false); return; }
      const res = await sync({ data: { accessToken: token } });
      if (res.ok) {
        setResult(`Synced ${res.itemsUpserted} items, ${res.pricesUpserted} prices.`);
      } else {
        setErr(res.error ?? "Unknown error");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
      load();
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">Biyo POS sync</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pulls menu items and per-location pricing from Biyo. New items are imported as <span className="font-semibold">inactive</span> — review and activate them in the Menu page.
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-bold">Location → Biyo store mapping</h2>
        {loading ? (
          <div className="mt-3 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2">Location</th>
                <th className="py-2">Biyo store ID</th>
              </tr>
            </thead>
            <tbody>
              {locs.map((l) => (
                <tr key={l.location_id} className="border-t border-border">
                  <td className="py-2 font-medium">{l.display_name ?? l.location_id}</td>
                  <td className="py-2">
                    <input
                      defaultValue={l.biyo_store_id}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== l.biyo_store_id) updateStore(l.location_id, v);
                      }}
                      className="w-32 rounded border border-border bg-background px-2 py-1"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Manual sync</h2>
          <button
            onClick={runSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        </div>
        {result && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-300">
            <CheckCircle2 className="size-4" /> {result}
          </div>
        )}
        {err && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="size-4 mt-0.5 shrink-0" />
            <span className="break-all">{err}</span>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-bold">Recent syncs</h2>
        {logs.length === 0 ? (
          <div className="mt-3 text-sm text-muted-foreground">No syncs yet.</div>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2">Started</th>
                <th className="py-2">Status</th>
                <th className="py-2">Items</th>
                <th className="py-2">Prices</th>
                <th className="py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="py-2 whitespace-nowrap">{new Date(l.started_at).toLocaleString()}</td>
                  <td className="py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${
                      l.status === "success" ? "bg-green-500/15 text-green-700 dark:text-green-300"
                      : l.status === "failed" ? "bg-destructive/15 text-destructive"
                      : "bg-muted text-muted-foreground"
                    }`}>{l.status}</span>
                  </td>
                  <td className="py-2">{l.items_upserted ?? "—"}</td>
                  <td className="py-2">{l.prices_upserted ?? "—"}</td>
                  <td className="py-2 text-xs text-destructive">{l.error ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
