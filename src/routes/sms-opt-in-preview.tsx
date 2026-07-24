import { createFileRoute } from "@tanstack/react-router";
import screenshot from "@/assets/sms-opt-in-screenshot.png";

export const Route = createFileRoute("/sms-opt-in-preview")({
  head: () => ({
    meta: [
      { title: "SMS Opt-In Preview — The Kosher Nosh" },
      {
        name: "description",
        content:
          "Preview of the order status text updates opt-in page at The Kosher Nosh.",
      },
      { property: "og:title", content: "SMS Opt-In Preview — The Kosher Nosh" },
      {
        property: "og:description",
        content:
          "Preview of the order status text updates opt-in page at The Kosher Nosh.",
      },
    ],
  }),
  component: SmsOptInPreview,
});

function SmsOptInPreview() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <header className="mb-8">
        <span className="text-xs font-bold uppercase tracking-[0.3em] text-primary">
          Preview
        </span>
        <h1 className="mt-2 font-display text-4xl tracking-wide sm:text-5xl">
          SMS Opt-In Page Screenshot
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          A screenshot of the <code>/sms-opt-in</code> page for reference.
        </p>
      </header>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <img
          src={screenshot}
          alt="Screenshot of The Kosher Nosh order status text updates opt-in page, showing a mobile phone number field, consent checkbox, and Sign Up button."
          className="h-auto w-full"
        />
      </div>
    </div>
  );
}
