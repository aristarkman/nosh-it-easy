import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { buildGhlOrderContact } from "@/lib/ghl-contact";

export const Route = createFileRoute("/api/public/hooks/ghl-order-contact")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = z.object({ nonce: z.string().uuid() }).safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
        // A one-use random database-issued nonce authorizes exactly one queued
        // order. No public API key or caller-supplied customer data is trusted.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: rows, error: claimError } = await supabaseAdmin.rpc("claim_ghl_order_contact", { _nonce: parsed.data.nonce });
        if (claimError) return Response.json({ error: "Could not claim sync" }, { status: 500 });
        const row = rows?.[0];
        if (!row) return Response.json({ error: "Unauthorized" }, { status: 401 });
        let providerStatus: number | undefined;
        let providerError: string | undefined;
        try {
          const key = process.env.GHL_API_KEY;
          const locationId = process.env.GHL_LOCATION_ID;
          if (!key || !locationId) throw new Error("GoHighLevel connection is not configured");
          const contact = buildGhlOrderContact(row, locationId);
          let contactId: string | null = null;
          if (contact) {
            async function call(path: string, body: unknown) {
              const response = await fetch(`https://services.leadconnectorhq.com${path}`, {
                method: "POST",
                headers: { Authorization: `Bearer ${key}`, Version: "2021-07-28", "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(20_000),
              });
              if (!response.ok) {
                providerStatus = response.status;
                providerError = await response.text();
                console.error(`GoHighLevel contact request failed [${response.status}]: ${providerError}`);
                throw new Error(`GoHighLevel request failed (${response.status})`);
              }
              return response.json();
            }
            const result = z.object({ contact: z.object({ id: z.string().min(1) }) }).parse(await call("/contacts/upsert", contact.body));
            contactId = result.contact.id;
            // Append tags separately; including tags in upsert replaces existing ones.
            await call(`/contacts/${encodeURIComponent(contactId)}/tags`, { tags: contact.tags });
          }
          const { error } = await supabaseAdmin.from("ghl_order_contact_outbox").update({
            synced_at: new Date().toISOString(), contact_id: contactId, nonce_expires_at: null,
            last_error: contact ? null : "Skipped: no current marketing consent or valid consented contact details",
          }).eq("order_id", row.order_id);
          if (error) throw new Error("Could not record GoHighLevel sync result");
          await supabaseAdmin.rpc("send_pending_ghl_order_contacts");
          return Response.json({ ok: true, skipped: !contact });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Contact sync failed";
          console.error("GoHighLevel order contact sync failed:", message);
          const retryMinutes = Math.min(360, 5 * 2 ** Math.max(0, row.attempts - 1));
          await supabaseAdmin.from("ghl_order_contact_outbox").update({
            last_error: message, nonce_expires_at: null,
            next_attempt_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(),
          }).eq("order_id", row.order_id);
          return Response.json({ ok: false, error: message, providerStatus, providerError }, { status: 502 });
        }
      },
    },
  },
});