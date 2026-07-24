import { createFileRoute } from "@tanstack/react-router";

// Triggered by a Lovable Job every 15 minutes (same pattern as
// requote-scheduled-deliveries). We gate the actual send to the 8:30pm ET
// slot inside the handler, rather than relying on a once-a-day cron
// expression, so this doesn't drift across the DST changeover. A marker row
// in system_alerts makes the send idempotent in case the job ticks more than
// once inside the window.

const RECIPIENT = "ari@koshernosh.com";
const FROM_ADDRESS = "The Kosher Nosh <orders@takeout.koshernosh.com>";
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const LOCATION_NAMES: Record<string, string> = {
  "glen-rock": "Glen Rock",
  cresskill: "Cresskill",
};

function easternParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

// Midnight-to-midnight bounds for "today" in Eastern time, expressed as UTC
// ISO strings for the Supabase query.
function easternDayBoundsUtc(d: Date): { startUtc: string; endUtc: string; dateLabel: string } {
  const { year, month, day } = easternParts(d);
  const dateLabel = `${year}-${month}-${day}`;
  // Find the UTC instant for this Eastern-local midnight by checking the
  // offset at that moment (handles EST/EDT without a timezone library).
  const approxMidnightUtc = new Date(`${dateLabel}T00:00:00.000Z`);
  const offsetMs = approxMidnightUtc.getTime() - new Date(
    approxMidnightUtc.toLocaleString("en-US", { timeZone: "America/New_York" }),
  ).getTime();
  const startUtc = new Date(approxMidnightUtc.getTime() + offsetMs);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { startUtc: startUtc.toISOString(), endUtc: endUtc.toISOString(), dateLabel };
}

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export const Route = createFileRoute("/api/public/hooks/daily-sales-summary")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const now = new Date();
        const { hour, minute } = easternParts(now);
        // Only actually send in the 8:30pm ET window (runs every 15 min).
        if (!(hour === 20 && minute >= 15 && minute < 45)) {
          return new Response(JSON.stringify({ ok: true, skipped: "outside window" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { startUtc, endUtc, dateLabel } = easternDayBoundsUtc(now);

        // Idempotency: skip if we've already sent for this date.
        const { data: already } = await supabaseAdmin
          .from("system_alerts")
          .select("id")
          .eq("kind", "daily_sales_summary_sent")
          .eq("message", dateLabel)
          .maybeSingle();
        if (already) {
          return new Response(JSON.stringify({ ok: true, skipped: "already sent" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { data: orders, error } = await supabaseAdmin
          .from("orders")
          .select("location_id, total, status")
          .gte("created_at", startUtc)
          .lt("created_at", endUtc)
          .neq("status", "cancelled");

        if (error) {
          console.error("daily-sales-summary query error:", error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const byLocation: Record<string, { sales: number; count: number }> = {
          "glen-rock": { sales: 0, count: 0 },
          cresskill: { sales: 0, count: 0 },
        };
        for (const o of orders ?? []) {
          const loc = byLocation[o.location_id as string];
          if (!loc) continue;
          loc.sales += Number(o.total) || 0;
          loc.count += 1;
        }

        const totalSales = Object.values(byLocation).reduce((sum, l) => sum + l.sales, 0);
        const totalOrders = Object.values(byLocation).reduce((sum, l) => sum + l.count, 0);

        const rows = Object.entries(byLocation)
          .map(
            ([id, l]) => `
              <tr>
                <td style="padding:10px 14px;border-bottom:1px solid #eee;font-weight:600;">${LOCATION_NAMES[id] ?? id}</td>
                <td style="padding:10px 14px;border-bottom:1px solid #eee;text-align:right;">${l.count}</td>
                <td style="padding:10px 14px;border-bottom:1px solid #eee;text-align:right;">${money(l.sales)}</td>
              </tr>`,
          )
          .join("");

        const html = `
          <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;">
            <h2 style="margin:0 0 4px;">Daily Sales — ${dateLabel}</h2>
            <p style="color:#666;margin:0 0 20px;font-size:13px;">The Kosher Nosh · Nosh It Easy takeout</p>
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr>
                  <th style="text-align:left;padding:8px 14px;font-size:12px;text-transform:uppercase;color:#888;">Store</th>
                  <th style="text-align:right;padding:8px 14px;font-size:12px;text-transform:uppercase;color:#888;">Orders</th>
                  <th style="text-align:right;padding:8px 14px;font-size:12px;text-transform:uppercase;color:#888;">Sales</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
              <tfoot>
                <tr>
                  <td style="padding:12px 14px;font-weight:700;">Total</td>
                  <td style="padding:12px 14px;font-weight:700;text-align:right;">${totalOrders}</td>
                  <td style="padding:12px 14px;font-weight:700;text-align:right;">${money(totalSales)}</td>
                </tr>
              </tfoot>
            </table>
          </div>`;

        const text = [
          `Daily Sales — ${dateLabel}`,
          ...Object.entries(byLocation).map(
            ([id, l]) => `${LOCATION_NAMES[id] ?? id}: ${l.count} orders, ${money(l.sales)}`,
          ),
          `Total: ${totalOrders} orders, ${money(totalSales)}`,
        ].join("\n");

        if (!RESEND_API_KEY) {
          console.error("daily-sales-summary: RESEND_API_KEY not set");
          return new Response(JSON.stringify({ ok: false, error: "RESEND_API_KEY not set" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM_ADDRESS,
            to: [RECIPIENT],
            subject: `Daily Sales — ${dateLabel} (${totalOrders} orders, ${money(totalSales)})`,
            html,
            text,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error("daily-sales-summary: Resend error", res.status, body);
          return new Response(JSON.stringify({ ok: false, error: "Resend send failed" }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }

        await supabaseAdmin.from("system_alerts").insert({
          kind: "daily_sales_summary_sent",
          message: dateLabel,
          details: { totalSales, totalOrders },
        });

        return new Response(JSON.stringify({ ok: true, dateLabel, totalSales, totalOrders }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
