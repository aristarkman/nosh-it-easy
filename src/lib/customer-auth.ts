import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CustomerAuth = {
  loading: boolean;
  authed: boolean;
  userId: string | null;
  email: string;
  fullName: string;
  signOut: () => Promise<void>;
};

export function useCustomerAuth(): CustomerAuth {
  const [state, setState] = useState<CustomerAuth>({
    loading: true,
    authed: false,
    userId: null,
    email: "",
    fullName: "",
    signOut: async () => {
      await supabase.auth.signOut();
    },
  });

  useEffect(() => {
    let mounted = true;

    const apply = async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (!mounted) return;
      if (!u) {
        setState((p) => ({ ...p, loading: false, authed: false, userId: null, email: "", fullName: "" }));
        return;
      }
      setState((p) => ({
        ...p,
        loading: false,
        authed: true,
        userId: u.id,
        email: u.email ?? "",
        fullName: (u.user_metadata?.full_name as string) ?? (u.user_metadata?.name as string) ?? "",
      }));
    };

    apply();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void apply();
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
