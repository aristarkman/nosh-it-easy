import { createFileRoute } from "@tanstack/react-router";

// Hourly cron endpoint. pg_cron calls this with apikey header.
export const Route = createFileRoute("/api/public/hooks/sync-biyo")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { runBiyoSync } = await import("@/server/biyo-sync.server");
          const result = await runBiyoSync();
          return Response.json({ ok: true, ...result });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("sync-biyo cron failed:", msg);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
