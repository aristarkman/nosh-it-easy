import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — The Kosher Nosh" },
      {
        name: "description",
        content:
          "How The Kosher Nosh collects, uses, and protects your information when you order online.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-8">
        <span className="text-xs font-bold uppercase tracking-[0.3em] text-primary">
          Legal
        </span>
        <h1 className="mt-2 font-display text-4xl tracking-wide sm:text-5xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: May 7, 2026
        </p>
      </header>

      <div className="prose-content space-y-6 text-sm leading-relaxed text-foreground">
        <section>
          <h2 className="font-display text-2xl">1. Introduction</h2>
          <p className="mt-2 text-muted-foreground">
            The Kosher Nosh ("we," "us," or "our") operates this online ordering
            site for our Glen Rock and Cresskill, NJ delicatessens. This Privacy
            Policy explains what information we collect when you place an order
            or create an account, how we use it, and the choices you have.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">2. Information we collect</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              <strong className="text-foreground">Account information:</strong>{" "}
              name, email address, phone number, and password.
            </li>
            <li>
              <strong className="text-foreground">Order information:</strong>{" "}
              items ordered, pickup or delivery address, special instructions,
              and order history.
            </li>
            <li>
              <strong className="text-foreground">Payment information:</strong>{" "}
              processed by our payment processor. We do not store full card
              numbers on our servers.
            </li>
            <li>
              <strong className="text-foreground">Communications:</strong> SMS
              and email messages you send us, and our responses.
            </li>
            <li>
              <strong className="text-foreground">Device data:</strong> basic
              technical information such as IP address, browser, and device
              type, used to keep the site secure and working.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-2xl">3. How we use your information</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>To process and fulfill your pickup or delivery orders.</li>
            <li>To send order confirmations, status updates, and receipts.</li>
            <li>To provide customer support and respond to inquiries.</li>
            <li>To improve our menu, service, and website.</li>
            <li>To comply with legal obligations and prevent fraud.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-2xl">4. SMS / text messaging</h2>
          <p className="mt-2 text-muted-foreground">
            If you provide your mobile number when placing an order or creating
            an account, you consent to receive transactional text messages from
            us related to your order (for example, "order received," "ready for
            pickup," or "out for delivery"). Message and data rates may apply.
            Message frequency varies based on your order activity. Reply{" "}
            <strong className="text-foreground">STOP</strong> to opt out at any
            time, or <strong className="text-foreground">HELP</strong> for help.
            Opting out of SMS will not affect your ability to order — we will
            contact you by phone or email instead.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">5. How we share information</h2>
          <p className="mt-2 text-muted-foreground">
            We do not sell your personal information. We share information only
            with service providers who help us operate the site and fulfill
            orders, including:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Payment processors to charge your card.</li>
            <li>SMS and email providers to send order notifications.</li>
            <li>Delivery drivers to deliver your order.</li>
            <li>Hosting and database providers that store our data securely.</li>
            <li>Law enforcement when required by law.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-2xl">6. Data retention</h2>
          <p className="mt-2 text-muted-foreground">
            We keep order and account information for as long as your account is
            active and as needed to provide service, comply with our legal
            obligations, resolve disputes, and enforce our agreements.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">7. Your choices</h2>
          <p className="mt-2 text-muted-foreground">
            You may update your account information at any time by signing in.
            You may request deletion of your account by contacting us. You may
            opt out of marketing emails using the unsubscribe link in any
            marketing message.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">8. Children</h2>
          <p className="mt-2 text-muted-foreground">
            Our site is not directed to children under 13, and we do not
            knowingly collect personal information from them.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">9. Changes to this policy</h2>
          <p className="mt-2 text-muted-foreground">
            We may update this Privacy Policy from time to time. We will post
            the updated version here with a new "Last updated" date.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">10. Contact us</h2>
          <p className="mt-2 text-muted-foreground">
            Questions about this policy? Call our Glen Rock store, our Cresskill
            store, or email us — we're happy to help.
          </p>
        </section>
      </div>
    </div>
  );
}
