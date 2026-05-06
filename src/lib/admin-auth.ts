import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AdminAuth = {
  loading: boolean;
  authed: boolean;
  isAdmin: boolean;
  userId: string | null;
  email: string;
  locations: string[];
  signOut: () => Promise<void>;
};

export function useAdminAuth(): AdminAuth {
  const [state, setState] = useState<AdminAuth>({
    loading: true,
    authed: false,
    isAdmin: false,
    userId: null,
    email: "",
    locations: [],
    signOut: async () => {
      await supabase.auth.signOut();
    },
  });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) {
        if (mounted)
          setState((p) => ({ ...p, loading: false, authed: false }));
        return;
      }
      const uid = s.session.user.id;
      const [{ data: roles }, { data: locs }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("staff_locations").select("location_id").eq("user_id", uid),
      ]);
      if (!mounted) return;
      setState((p) => ({
        ...p,
        loading: false,
        authed: true,
        isAdmin: (roles ?? []).some((r) => r.role === "admin"),
        userId: uid,
        email: s.session?.user.email ?? "",
        locations: (locs ?? []).map((l) => l.location_id),
      }));
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
