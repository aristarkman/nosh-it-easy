import { createFileRoute } from "@tanstack/react-router";

// Called daily by pg_cron. Sends the next warm-up batch for every running
// marketing campaign (one batch per calendar day, per campaign).
export const Route = createFileRoute("/api/public/hooks/marketing-drip")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const allowed = [process.env.SUPABASE_PUBLISHABLE_KEY, process.env.SUPABASE_ANON_KEY].filter(Boolean);
        if (!apikey || !allowed.includes(apikey)) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { runAllDueCampaigns } = await import("@/server/marketing-drip.server");
        try {
          const results = await runAllDueCampaigns();
          return Response.json({ ok: true, results });
        } catch (e) {
          console.error("marketing-drip failed:", e);
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
    },
  },
});
