import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/staff/login")({
  head: () => ({ meta: [{ title: "Staff Login — The Kosher Nosh" }] }),
  component: StaffLoginPage,
});

function StaffLoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav({ to: "/tablet" });
    });
  }, [nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    nav({ to: "/tablet" });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-muted/40 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">
            Staff Access
          </div>
          <h1 className="font-display text-2xl tracking-wide">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Use the credentials provided by your manager.
          </p>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Email
          </span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Password
          </span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-black uppercase tracking-wider text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
