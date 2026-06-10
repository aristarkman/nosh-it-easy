import { createServerFn } from "@tanstack/react-start";

// Admin-triggered manual sync. Client passes the user's access token in `data`.
export const syncBiyoNow = createServerFn({ method: "POST" })
  .inputValidator((data: { accessToken: string }) => data)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runBiyoSync } = await import("@/server/biyo-sync.server");
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(data.accessToken);
    if (userErr || !userData?.user) {
      return { ok: false as const, error: "Not authenticated" };
    }
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    if (!isAdmin) {
      return { ok: false as const, error: "Admin only" };
    }
    try {
      const result = await runBiyoSync();
      return { ok: true as const, ...result };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("syncBiyoNow failed:", msg);
      return { ok: false as const, error: msg };
    }
  });
