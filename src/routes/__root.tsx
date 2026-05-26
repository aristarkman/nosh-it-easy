import { Outlet, Link, createRootRoute, HeadContent, Scripts, useLocation } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import appCss from "../styles.css?url";
import { OrderProvider } from "@/lib/order-context";
import { SiteHeader } from "@/components/site-header";
import { ScrollToTop } from "@/components/scroll-to-top";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-black text-primary">404</h1>
        <h2 className="mt-4 font-display text-xl font-semibold">Page not on the menu</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          That page doesn't exist (or it sold out).
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Back to ordering
          </Link>
        </div>
      </div>
    </div>
  );
}

const SITE_URL = "https://nosh-it-easy.lovable.app";
const OG_IMAGE =
  "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/aa7ac457-fa46-45da-8dc0-b59bf97f8ae1/id-preview-72af64d7--97170e30-27fe-4893-b45b-869d09d9e0e7.lovable.app-1778084387913.png";

const RESTAURANT_JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Restaurant",
      "@id": `${SITE_URL}/#glen-rock`,
      name: "The Famous Kosher Nosh — Glen Rock",
      url: SITE_URL,
      image: OG_IMAGE,
      priceRange: "$$",
      servesCuisine: ["Jewish Deli", "Kosher", "American"],
      telephone: "+1-201-445-1186",
      address: {
        "@type": "PostalAddress",
        streetAddress: "230 Rock Rd",
        addressLocality: "Glen Rock",
        addressRegion: "NJ",
        postalCode: "07452",
        addressCountry: "US",
      },
      acceptsReservations: false,
      hasMenu: `${SITE_URL}/menu`,
      potentialAction: {
        "@type": "OrderAction",
        target: `${SITE_URL}/menu`,
        deliveryMethod: [
          "http://purl.org/goodrelations/v1#DeliveryModePickUp",
          "http://purl.org/goodrelations/v1#DeliveryModeOwnFleet",
        ],
      },
    },
    {
      "@type": "Restaurant",
      "@id": `${SITE_URL}/#cresskill`,
      name: "The Famous Kosher Nosh — Cresskill",
      url: SITE_URL,
      image: OG_IMAGE,
      priceRange: "$$",
      servesCuisine: ["Jewish Deli", "Kosher", "American"],
      telephone: "+1-201-331-0000",
      address: {
        "@type": "PostalAddress",
        streetAddress: "27 Union Ave",
        addressLocality: "Cresskill",
        addressRegion: "NJ",
        postalCode: "07626",
        addressCountry: "US",
      },
      acceptsReservations: false,
      hasMenu: `${SITE_URL}/menu`,
      potentialAction: {
        "@type": "OrderAction",
        target: `${SITE_URL}/menu`,
        deliveryMethod: [
          "http://purl.org/goodrelations/v1#DeliveryModePickUp",
          "http://purl.org/goodrelations/v1#DeliveryModeOwnFleet",
        ],
      },
    },
    {
      "@type": "Organization",
      name: "The Famous Kosher Nosh",
      url: SITE_URL,
      logo: OG_IMAGE,
      sameAs: [],
    },
  ],
};

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "The Famous Kosher Nosh — Order Pickup & Delivery in Glen Rock & Cresskill, NJ" },
      {
        name: "description",
        content:
          "Order pastrami, knishes, matzo ball soup, and classic Jewish deli online from The Famous Kosher Nosh. Pickup and delivery in Glen Rock and Cresskill, NJ.",
      },
      { name: "robots", content: "index,follow,max-image-preview:large" },
      { name: "theme-color", content: "#b91c1c" },
      { property: "og:site_name", content: "The Famous Kosher Nosh" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { property: "og:title", content: "The Famous Kosher Nosh — Glen Rock & Cresskill, NJ" },
      {
        property: "og:description",
        content: "NY-style Jewish deli in NJ since 1985. Order pickup or delivery online.",
      },
      { property: "og:image", content: OG_IMAGE },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "The Famous Kosher Nosh" },
      { name: "twitter:description", content: "NY-style Jewish deli in NJ. Pickup or delivery." },
      { name: "twitter:image", content: OG_IMAGE },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "canonical", href: SITE_URL },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(RESTAURANT_JSONLD),
      },
      // Google Tag Manager + gtag.js (Google Ads + GT container)
      {
        async: true,
        src: "https://www.googletagmanager.com/gtag/js?id=AW-18036296296",
      },
      {
        children: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','AW-18036296296');gtag('config','GT-NCN5WBBD');`,
      },
      {
        children: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-MBKVX6Z5');`,
      },
      // Meta Pixel
      {
        children: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','318948217869757');fbq('track','PageView');`,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-MBKVX6Z5"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            src="https://www.facebook.com/tr?id=318948217869757&ev=PageView&noscript=1"
            alt=""
          />
        </noscript>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const [queryClient] = useState(() => new QueryClient());
  const path = useLocation({ select: (l) => l.pathname });
  const isChromeless = path.startsWith("/tablet") || path.startsWith("/dispatch");
  const firstPath = useState(path)[0];
  // SPA page-view tracking on route changes (skip first; initial fired in head script)
  useEffect(() => {
    if (path === firstPath) return;
    void import("@/lib/tracking").then((m) => m.trackPageView(path));
  }, [path, firstPath]);
  return (
    <QueryClientProvider client={queryClient}>
      <OrderProvider>
        <div className="flex min-h-screen flex-col paper-bg">
          {!isChromeless && <SiteHeader />}
          <main className="flex-1">
            <Outlet />
          </main>
          {!isChromeless && (
          <footer className="mt-16 border-t border-border bg-card/60">
            <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground">
              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <div>
                  <div className="font-display text-lg font-bold text-foreground">The Kosher Nosh</div>
                  <p>A New York deli, in New Jersey, Kosher since 1976.</p>
                </div>
                <div className="text-right text-xs uppercase tracking-widest">
                  <div>Glen Rock · Cresskill</div>
                  <div className="mt-2 flex justify-end gap-4 normal-case tracking-normal">
                    <Link to="/privacy" className="hover:text-primary">Privacy</Link>
                    <Link to="/terms" className="hover:text-primary">Terms</Link>
                  </div>
                </div>
              </div>
            </div>
          </footer>
          )}
          {!isChromeless && <ScrollToTop />}
        </div>
      </OrderProvider>
    </QueryClientProvider>
  );
}
