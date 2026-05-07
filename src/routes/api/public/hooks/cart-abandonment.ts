import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Called by pg_cron every 15 min. Sends SMS to abandoned carts >60min stale,
// not yet reminded, with marketing_sms_opt_in=true.
export const Route = createFileRoute("/api/public/hooks/cart-abandonment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const cutoff = new Date(Date.now() - 60 * 60_000).toISOString();
        const { data: carts } = await supabaseAdmin
          .from("abandoned_carts")
          .select("id,session_id,phone,email,customer_name,subtotal,item_count,marketing_sms_opt_in,marketing_email_opt_in,reminded_sms_at,reminded_email_at")
          .eq("recovered", false)
          .gt("item_count", 0)
          .lte("last_activity_at", cutoff)
          .limit(50);

        let smsSent = 0;
        for (const c of carts ?? []) {
          if (c.marketing_sms_opt_in && c.phone && !c.reminded_sms_at) {
            try {
              const digits = c.phone.replace(/\D/g, "");
              const to = digits.length === 10 ? `+1${digits}` : digits.startsWith("1") ? `+${digits}` : `+${digits}`;
              const name = c.customer_name ? `, ${c.customer_name.split(" ")[0]}` : "";
              const body = `The Kosher Nosh: You left ${c.item_count} item(s) in your cart${name}. Finish your order at https://nosh-it-easy.lovable.app/cart — reply STOP to opt out.`;
              const r = await fetch("https://connector-gateway.lovable.dev/twilio/Messages.json", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`,
                  "X-Connection-Api-Key": process.env.TWILIO_API_KEY!,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({ To: to, From: "+16097401249", Body: body }),
              });
              if (r.ok) {
                smsSent++;
                await supabaseAdmin.from("abandoned_carts").update({ reminded_sms_at: new Date().toISOString() }).eq("id", c.id);
              }
            } catch (e) {
              console.error("abandon sms failed:", e);
            }
          }
          // Email reminders deferred until Lovable Emails sender domain is configured.
        }

        return Response.json({ ok: true, considered: carts?.length ?? 0, smsSent });
      },
    },
  },
});
