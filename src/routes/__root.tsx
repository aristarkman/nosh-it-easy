import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { OrderProvider } from "@/lib/order-context";
import { SiteHeader } from "@/components/site-header";

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

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Order Online — The Kosher Nosh" },
      {
        name: "description",
        content:
          "Order pickup or delivery from The Kosher Nosh — classic NY Jewish deli with locations in Glen Rock and Cresskill, NJ.",
      },
      { property: "og:title", content: "Order Online — The Kosher Nosh" },
      {
        property: "og:description",
        content: "Pastrami, knishes, matzo ball soup. Pickup or delivery from Glen Rock & Cresskill.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Order Online — The Kosher Nosh" },
      { name: "description", content: "Nosh Direct is a custom online ordering platform for The Kosher Nosh deli." },
      { property: "og:description", content: "Nosh Direct is a custom online ordering platform for The Kosher Nosh deli." },
      { name: "twitter:description", content: "Nosh Direct is a custom online ordering platform for The Kosher Nosh deli." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/aa7ac457-fa46-45da-8dc0-b59bf97f8ae1/id-preview-72af64d7--97170e30-27fe-4893-b45b-869d09d9e0e7.lovable.app-1778084387913.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/aa7ac457-fa46-45da-8dc0-b59bf97f8ae1/id-preview-72af64d7--97170e30-27fe-4893-b45b-869d09d9e0e7.lovable.app-1778084387913.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
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
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <OrderProvider>
      <div className="flex min-h-screen flex-col paper-bg">
        <SiteHeader />
        <main className="flex-1">
          <Outlet />
        </main>
        <footer className="mt-16 border-t border-border bg-card/60">
          <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <div>
                <div className="font-display text-lg font-bold text-foreground">The Kosher Nosh</div>
                <p>A New York deli, in New Jersey, since 1985.</p>
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
      </div>
    </OrderProvider>
  );
}
