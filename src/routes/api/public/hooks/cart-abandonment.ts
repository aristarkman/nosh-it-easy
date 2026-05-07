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

        const ghlKey = process.env.GHL_API_KEY;
        const ghlLocation = process.env.GHL_LOCATION_ID;

        async function sendGhlEmail(c: { email: string; customer_name: string | null; phone: string | null; item_count: number }) {
          if (!ghlKey || !ghlLocation) throw new Error("GHL not configured");
          const [firstName, ...rest] = (c.customer_name ?? "").trim().split(/\s+/);
          const lastName = rest.join(" ") || undefined;

          // Upsert contact in GHL
          const contactRes = await fetch("https://services.leadconnectorhq.com/contacts/upsert", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${ghlKey}`,
              Version: "2021-07-28",
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              locationId: ghlLocation,
              email: c.email,
              firstName: firstName || undefined,
              lastName,
              phone: c.phone || undefined,
              tags: ["abandoned-cart"],
            }),
          });
          if (!contactRes.ok) throw new Error(`GHL contact upsert ${contactRes.status}: ${await contactRes.text()}`);
          const contactJson = await contactRes.json() as any;
          const contactId = contactJson?.contact?.id ?? contactJson?.id;
          if (!contactId) throw new Error("GHL contact upsert: no id returned");

          const greeting = firstName ? `Hi ${firstName},` : "Hi there,";
          const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#222;background:#fff;padding:24px">
            <h2 style="margin:0 0 12px">You left something behind 🥯</h2>
            <p style="margin:0 0 12px">${greeting}</p>
            <p style="margin:0 0 12px">You have <strong>${c.item_count} item(s)</strong> waiting in your cart at <strong>The Famous Kosher Nosh</strong>.</p>
            <p style="margin:24px 0"><a href="https://nosh-it-easy.lovable.app/cart" style="background:#c9a84c;color:#0d0d0d;padding:12px 20px;text-decoration:none;border-radius:6px;font-weight:600">Finish your order</a></p>
            <p style="font-size:12px;color:#666;margin-top:32px">The Famous Kosher Nosh — Glen Rock & Cresskill, NJ</p>
          </body></html>`;

          const msgRes = await fetch("https://services.leadconnectorhq.com/conversations/messages", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${ghlKey}`,
              Version: "2021-04-15",
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              type: "Email",
              contactId,
              subject: "You left items in your cart at The Famous Kosher Nosh",
              html,
            }),
          });
          if (!msgRes.ok) throw new Error(`GHL email send ${msgRes.status}: ${await msgRes.text()}`);
        }

        let smsSent = 0;
        let emailSent = 0;
        const errors: string[] = [];
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

          if (c.marketing_email_opt_in && c.email && !c.reminded_email_at) {
            try {
              await sendGhlEmail({ email: c.email, customer_name: c.customer_name, phone: c.phone, item_count: c.item_count });
              emailSent++;
              await supabaseAdmin.from("abandoned_carts").update({ reminded_email_at: new Date().toISOString() }).eq("id", c.id);
            } catch (e: any) {
              console.error("abandon email (GHL) failed:", e);
              errors.push(String(e?.message ?? e));
            }
          }
        }

        return Response.json({ ok: true, considered: carts?.length ?? 0, smsSent, emailSent, errors });
      },
    },
  },
});
