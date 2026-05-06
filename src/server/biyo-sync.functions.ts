import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runBiyoSync } from "./biyo-sync.server";

// Admin-triggered manual sync
export const syncBiyoNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Verify admin role
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
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
