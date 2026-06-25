import { useEffect, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Gift } from "lucide-react";

const DISMISS_KEY = "kn-welcome-dismissed";
const SKIP_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password", "/admin", "/tablet", "/dispatch", "/staff", "/checkout"];

export function WelcomePopup() {
  const pathname = useLocation({ select: (l) => l.pathname });
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setAuthed(!!data.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session?.user);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (authed !== false) return;
    if (SKIP_PATHS.some((p) => pathname.startsWith(p))) return;
    if (typeof window !== "undefined" && sessionStorage.getItem(DISMISS_KEY)) return;
    const t = setTimeout(() => setOpen(true), 400);
    return () => clearTimeout(t);
  }, [authed, pathname]);

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setOpen(false);
  };

  if (authed !== false) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : dismiss())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Gift className="h-7 w-7" />
          </div>
          <DialogTitle className="text-center font-display text-2xl">
            Welcome to The Famous Kosher Nosh!
          </DialogTitle>
          <DialogDescription className="text-center text-base">
            Sign up and get <strong className="text-foreground">100 bonus points</strong> ($5 off your first order) — plus earn 1 point per $1 on every order.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 flex flex-col gap-2">
          <Button asChild size="lg" className="w-full" onClick={dismiss}>
            <Link to="/signup">Create account & claim 100 points</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full" onClick={dismiss}>
            <Link to="/login">Already a customer? Sign in</Link>
          </Button>
          <button
            type="button"
            onClick={dismiss}
            className="mt-1 text-center text-xs text-muted-foreground hover:text-foreground"
          >
            Maybe later
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          New accounts only. Points credit instantly on signup.
        </p>
      </DialogContent>
    </Dialog>
  );
}
