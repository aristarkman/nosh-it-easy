## Welcome Popup: 100 Bonus Loyalty Points

### Behavior
- Appears immediately on first page load for any visitor who is **not signed in**.
- Re-shows on every visit until the user signs in (dismissal is per-session only — clicking X closes it for that session but it returns next visit).
- Two CTAs:
  1. **"Create account & claim 100 points"** → routes to `/auth` in signup mode.
  2. **"Already a customer? Sign in"** → routes to `/auth` in login mode.
- Hidden entirely once the user is authenticated.
- Does not appear on `/auth` itself (avoid loop) or admin/checkout routes (avoid interrupting flows).

### Bonus point logic
- Any **new account signup** auto-credits 100 points (not gated by popup CTA).
- Implemented server-side via a `welcome_bonus` entry inserted into `loyalty_ledger` the first time a `customer_profiles` row is created.
- Uses the existing `handle_new_customer` trigger pattern — extend it to also insert a +100 `welcome_bonus` row in `loyalty_ledger`.
- Idempotent: only awarded once per `user_id` (enforced by checking for an existing `welcome_bonus` reason).

### UI
- Reuses existing shadcn `Dialog` component, styled to match the deli's warm/cream theme.
- Headline: "Welcome to The Famous Kosher Nosh!"
- Subhead: "Sign up and get **100 bonus points** ($5 off your first order) — plus earn 1 point per $1 on every order."
- Small print: "New accounts only. Points credit instantly on signup."

### Technical details
- New component: `src/components/welcome-popup.tsx` — reads auth state via `supabase.auth.getUser()` + `onAuthStateChange`, uses `sessionStorage` key `kn-welcome-dismissed` for per-session dismissal.
- Mounted once in `src/routes/__root.tsx` so it shows on any first page hit.
- Migration: update `handle_new_customer()` to also `INSERT INTO loyalty_ledger (user_id, points, reason) VALUES (NEW.id, 100, 'welcome_bonus') ON CONFLICT DO NOTHING;` — guarded by a `NOT EXISTS` check on `(user_id, reason='welcome_bonus')`.
- Route-aware: popup component checks `useLocation()` and skips on `/auth`, `/admin/*`, `/checkout`.

### Out of scope
- No email verification gating (points credit on signup regardless).
- No A/B test or analytics event tracking beyond existing patterns.
- No edit to the loyalty earn rate or redemption rules.