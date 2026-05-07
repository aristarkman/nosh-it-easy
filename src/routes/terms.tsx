import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — The Kosher Nosh" },
      {
        name: "description",
        content:
          "Terms and conditions for ordering pickup and delivery from The Kosher Nosh.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-8">
        <span className="text-xs font-bold uppercase tracking-[0.3em] text-primary">
          Legal
        </span>
        <h1 className="mt-2 font-display text-4xl tracking-wide sm:text-5xl">
          Terms &amp; Conditions
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: May 7, 2026
        </p>
      </header>

      <div className="space-y-6 text-sm leading-relaxed text-foreground">
        <section>
          <h2 className="font-display text-2xl">1. Acceptance</h2>
          <p className="mt-2 text-muted-foreground">
            By placing an order or creating an account on this site, you agree
            to these Terms &amp; Conditions and our Privacy Policy. If you do
            not agree, please do not use the site.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">2. Ordering</h2>
          <p className="mt-2 text-muted-foreground">
            Online orders are offers to purchase, accepted when we confirm the
            order. We may refuse or cancel an order at our discretion (for
            example, if an item is sold out, the address is outside our
            delivery area, or we suspect fraud). Prices, items, and hours may
            change without notice.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">3. Pricing &amp; payment</h2>
          <p className="mt-2 text-muted-foreground">
            All prices are in U.S. dollars and exclude applicable sales tax,
            tips, and delivery fees, which are added at checkout. Payment is
            authorized when you place the order and captured when we accept it.
            You authorize us and our payment processor to charge your selected
            payment method for the full order total.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">4. Pickup &amp; delivery</h2>
          <p className="mt-2 text-muted-foreground">
            Estimated pickup and delivery times are estimates, not guarantees,
            and may be affected by order volume, weather, and traffic. For
            delivery orders, you must provide an accurate address and be
            available to receive the order. Risk of loss passes to you upon
            handoff at pickup or delivery to your address.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">5. Cancellations &amp; refunds</h2>
          <p className="mt-2 text-muted-foreground">
            Because food is prepared to order, orders generally cannot be
            cancelled once preparation has started. If something is wrong with
            your order, please contact the store directly within 24 hours and
            we'll make it right. Refunds, when issued, will be returned to the
            original payment method.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">6. Allergens &amp; food safety</h2>
          <p className="mt-2 text-muted-foreground">
            Our kitchen handles wheat, eggs, dairy, soy, fish, tree nuts, and
            other common allergens. We cannot guarantee that any item is free
            of cross-contact. If you have a serious allergy, please call the
            store before ordering. You are responsible for reading item
            descriptions and choosing items appropriate for your dietary needs.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">7. Account responsibility</h2>
          <p className="mt-2 text-muted-foreground">
            You are responsible for keeping your password secure and for all
            activity on your account. Notify us promptly of any unauthorized
            use.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">8. SMS &amp; communications</h2>
          <p className="mt-2 text-muted-foreground">
            By providing your phone number, you consent to receive
            transactional text messages and calls related to your order.
            Message and data rates may apply. Reply STOP to opt out of texts.
            See our Privacy Policy for more detail.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">9. Acceptable use</h2>
          <p className="mt-2 text-muted-foreground">
            You agree not to use the site to place fraudulent orders, harass
            our staff or drivers, attempt to interfere with the site's
            operation, or violate any applicable law.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">10. Intellectual property</h2>
          <p className="mt-2 text-muted-foreground">
            All content on this site — including the name "The Kosher Nosh,"
            our logos, menu descriptions, photos, and design — is owned by us
            or our licensors and may not be copied or used without permission.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">11. Disclaimers</h2>
          <p className="mt-2 text-muted-foreground">
            The site is provided "as is" without warranties of any kind, either
            express or implied. We do not warrant that the site will be
            uninterrupted, error-free, or secure.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">12. Limitation of liability</h2>
          <p className="mt-2 text-muted-foreground">
            To the fullest extent permitted by law, our total liability for any
            claim arising from your use of the site or an order is limited to
            the amount you paid for the order in question. We are not liable
            for indirect, incidental, or consequential damages.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">13. Governing law</h2>
          <p className="mt-2 text-muted-foreground">
            These Terms are governed by the laws of the State of New Jersey,
            without regard to its conflict-of-laws rules. Any dispute will be
            resolved in the state or federal courts located in Bergen County,
            New Jersey.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">14. Changes</h2>
          <p className="mt-2 text-muted-foreground">
            We may update these Terms from time to time. Continued use of the
            site after changes are posted constitutes acceptance of the
            updated Terms.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">15. Contact</h2>
          <p className="mt-2 text-muted-foreground">
            Questions? Contact either of our locations and we'll be glad to
            help.
          </p>
        </section>
      </div>
    </div>
  );
}
