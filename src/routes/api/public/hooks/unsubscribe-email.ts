import { createFileRoute } from "@tanstack/react-router";

// One-click unsubscribe for marketing emails to the app's own opted-in
// customer_profiles audience. Only that audience gets a real, working
// unsubscribe link -- imported/external contacts (e.g. a GloriaFood CSV)
// have no persistent record to flip, so they get a reply-to-unsubscribe
// instruction instead (see send-marketing-email edge function).
//
// UNSUBSCRIBE_SECRET must be set to the SAME value here (Lovable Cloud
// secrets) and in the send-marketing-email Supabase Edge Function secrets
// -- they're separate runtimes with separate secret stores, and the token
// this route verifies has to match the one that function generated.
export const Route = createFileRoute("/api/public/hooks/unsubscribe-email")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const url = new URL(request.url);
        const email = url.searchParams.get("email");
        const token = url.searchParams.get("token");

        const page = (title: string, body: string, status = 200) =>
          new Response(
            `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>body{font-family:-apple-system,sans-serif;max-width:480px;margin:80px auto;padding:0 20px;text-align:center;color:#1a1a1a;}</style>
            </head><body><h2>${title}</h2><p>${body}</p></body></html>`,
            { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
          );

        if (!email || !token)
          return page("Invalid link", "This unsubscribe link is missing information.", 400);

        const secret = process.env.UNSUBSCRIBE_SECRET;
        if (!secret) {
          console.error("UNSUBSCRIBE_SECRET not configured");
          return page("Something went wrong", "Please contact us directly to unsubscribe.", 500);
        }

        const crypto = await import("node:crypto");
        const expected = crypto
          .createHmac("sha256", secret)
          .update(email.toLowerCase())
          .digest("hex")
          .slice(0, 32);
        if (token !== expected)
          return page("Invalid link", "This unsubscribe link is not valid.", 400);

        const { error } = await supabaseAdmin
          .from("customer_profiles")
          .update({ marketing_email: false })
          .eq("email", email.toLowerCase());
        if (error) {
          console.error("unsubscribe-email failed:", error);
          return page("Something went wrong", "Please contact us directly to unsubscribe.", 500);
        }

        return page(
          "You're unsubscribed",
          `${email} will no longer receive marketing emails from The Kosher Nosh.`,
        );
      },
    },
  },
});
