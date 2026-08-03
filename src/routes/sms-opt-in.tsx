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
  const [transactionalConsent, setTransactionalConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<"subscribed" | "not_opted_in" | null>(null);

  const handleSignUp = async () => {
    setError(null);

    // Both checkboxes are entirely optional and independent. Without at
    // least one, we record nothing and send nothing.
    if ((!transactionalConsent && !marketingConsent) || !phone.trim()) {
      setResult("not_opted_in");
      return;
    }

    setSubmitting(true);
    try {
      const response = await subscribeToSmsUpdates({
        data: {
          phone: phone.trim(),
          transactionalConsent,
          marketingConsent,
          source: "sms_opt_in_page",
        },
      });
      if (!response.ok) {
        setError("Something went wrong. Please try again.");
        return;
      }
      setResult("subscribed");
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

      {result ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm">
          {result === "subscribed"
            ? "Thanks — you're signed up for text updates."
            : "Submitted — you have not opted in to text messages and will not receive any."}
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
              id="smsOptInTransactional"
              checked={transactionalConsent}
              onCheckedChange={(checked) => setTransactionalConsent(checked === true)}
            />
            <label
              htmlFor="smsOptInTransactional"
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

          <div className="flex items-start gap-2">
            <Checkbox
              id="smsOptInMarketing"
              checked={marketingConsent}
              onCheckedChange={(checked) => setMarketingConsent(checked === true)}
            />
            <label
              htmlFor="smsOptInMarketing"
              className="text-sm text-muted-foreground leading-snug"
            >
              I agree to receive marketing text messages (deals, specials,
              and cart reminders) from The Kosher Nosh at the number
              provided. Message frequency varies. Msg &amp; data rates may
              apply. Reply STOP to opt out, HELP for help. Consent is not a
              condition of purchase.{" "}
              <Link to="/privacy" className="underline">
                Privacy Policy
              </Link>{" "}
              ·{" "}
              <Link to="/terms" className="underline">
                Terms
              </Link>
              . Marketing consent can also be managed anytime in{" "}
              <Link to="/account" className="underline">
                account settings
              </Link>
              .
            </label>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button onClick={handleSignUp} className="w-full sm:w-auto">
            {submitting ? "Signing up…" : "Sign Up"}
          </Button>
        </div>
      )}
    </div>
  );
}
