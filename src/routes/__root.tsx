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
      { property: "og:title", content: "The Kosher Nosh — Order Online" },
      {
        property: "og:description",
        content: "Pastrami, knishes, matzo ball soup. Pickup or delivery from Glen Rock & Cresskill.",
      },
      { property: "og:type", content: "website" },
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
                Glen Rock · Cresskill
              </div>
            </div>
          </div>
        </footer>
      </div>
    </OrderProvider>
  );
}
