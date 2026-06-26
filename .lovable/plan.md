## Add optional delivery address step after signup

After a customer creates an account, route them to a new follow-up screen that prompts for a delivery address. The step is fully optional — they can save it or skip to continue.

### Flow
1. User completes signup on the existing auth form.
2. On successful account creation (new user, not login), redirect to `/welcome/address` instead of the current post-signup destination.
3. The screen shows:
   - Heading: "Add a delivery address" with subtext explaining it speeds up future checkout and is optional.
   - Google Places autocomplete address field (reusing the same autocomplete component used at checkout) with unit/apt, city, state, zip, and an optional delivery notes field.
   - "Save address" primary button — writes to `customer_addresses` (marked as default) then continues.
   - "Skip for now" secondary link — continues without saving.
4. After save or skip, redirect to the home page (or back to the page they came from if we captured one pre-signup).

### Technical notes
- New route file: `src/routes/welcome.address.tsx` (public route; user is authenticated by the time they land here).
- Reuse the existing address autocomplete + geocoding helpers already used on `/checkout` so behavior matches (zone validation can be skipped here — saving an out-of-zone address is fine, we just won't preselect delivery).
- Save via a new `saveCustomerAddress` server function in `src/lib/customer-address.functions.ts` using `requireSupabaseAuth`; insert into `customer_addresses` with `is_default = true` when it's the user's first address.
- Update the signup handler in the auth route to detect the "just signed up" case and `navigate({ to: "/welcome/address" })` instead of the current redirect. Login flow is untouched.
- No schema changes — `customer_addresses` already exists.
- No changes to checkout, header, or other flows.