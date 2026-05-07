import { createFileRoute } from "@tanstack/react-router";

const SITE_URL = "https://nosh-it-easy.lovable.app";

const body = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /tablet
Disallow: /dispatch
Disallow: /staff/login
Disallow: /checkout
Disallow: /cart
Disallow: /account
Disallow: /confirmation/

Sitemap: ${SITE_URL}/sitemap.xml
`;

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async () =>
        new Response(body, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        }),
    },
  },
});
