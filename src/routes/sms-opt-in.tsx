import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { subscribeToSmsUpdates } from "@/lib/sms.functions";

export const Route = createFileRoute("/sms-opt-in")({
  head: () => ({
    meta: [
      { title: "Order Status Text Updates — The Kosher Nosh" },
      {
        name: "description",
        content: "Sign up for order status text updates from The Kosher Nosh.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: SmsOptInPage,
});

function SmsOptInPage() {
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canSubmit = phone.trim().length > 0 && !submitting;

  const handleSignUp = async () => {
    if (!phone.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await subscribeToSmsUpdates({
        data: { phone: phone.trim(), consent },
      });
      if (!result.ok) {
        setError(
          result.error === "Consent required"
            ? "Please check the consent box to sign up."
            : "Something went wrong. Please try again.",
        );
        return;
      }
      setDone(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <header className="mb-8">
        <span className="text-xs font-bold uppercase tracking-[0.3em] text-primary">
          Text Updates
        </span>
        <h1 className="mt-2 font-display text-4xl tracking-wide sm:text-5xl">
          Order Status Text Updates
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Get text updates about your Kosher Nosh online orders. This is the
          same opt-in shown during checkout at takeout.koshernosh.com.
        </p>
      </header>

      {done ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm">
          Thanks — you're signed up for order status texts.
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <div className="space-y-1.5">
            <label htmlFor="smsOptInPhone" className="text-sm font-semibold">
              Mobile phone number
            </label>
            <Input
              id="smsOptInPhone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(201) 555-0123"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="smsOptInConsent"
              checked={consent}
              onCheckedChange={(checked) => setConsent(checked === true)}
            />
            <label
              htmlFor="smsOptInConsent"
              className="text-sm text-muted-foreground leading-snug"
            >
              I agree to receive order status text messages (order received,
              ready for pickup, out for delivery) from The Kosher Nosh at the
              number provided. Message frequency varies. Msg &amp; data rates
              may apply. Reply STOP to opt out, HELP for help. Consent is not
              a condition of purchase.{" "}
              <Link to="/privacy" className="underline">
                Privacy Policy
              </Link>{" "}
              ·{" "}
              <Link to="/terms" className="underline">
                Terms
              </Link>
            </label>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button onClick={handleSignUp} disabled={!canSubmit} className="w-full sm:w-auto">
            {submitting ? "Signing up…" : "Sign Up"}
          </Button>
        </div>
      )}
    </div>
  );
}
