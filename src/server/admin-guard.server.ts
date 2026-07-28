import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function requireAdminByToken(accessToken: string) {
  const { data: userData, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !userData?.user) return { ok: false as const, error: "Not authenticated" };
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  if (!(roles ?? []).some((r) => r.role === "admin")) {
    return { ok: false as const, error: "Admin only" };
  }
  return { ok: true as const, userId: userData.user.id, supabaseAdmin };
}
