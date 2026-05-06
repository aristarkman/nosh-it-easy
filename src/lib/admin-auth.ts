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
    const setSignedOut = () => {
      if (mounted) {
        setState((p) => ({
          ...p,
          loading: false,
          authed: false,
          isAdmin: false,
          userId: null,
          email: "",
          locations: [],
        }));
      }
    };

    const load = async () => {
      const { data, error } = await supabase.auth.getUser();
      const user = data.user;

      if (error || !user) {
        setSignedOut();
        return;
      }

      const uid = user.id;
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
        email: user.email ?? "",
        locations: (locs ?? []).map((l) => l.location_id),
      }));
    };
    load();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session?.user) {
        setSignedOut();
        return;
      }

      setState((p) => ({ ...p, loading: true }));
      void load();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
