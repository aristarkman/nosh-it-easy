import { createFileRoute } from "@tanstack/react-router";

const SITE_URL = "https://nosh-it-easy.lovable.app";

const PUBLIC_PATHS = ["/", "/menu", "/order-type", "/login", "/signup", "/privacy", "/terms"];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const today = new Date().toISOString().split("T")[0];
        const urls = PUBLIC_PATHS.map(
          (p) =>
            `  <url><loc>${SITE_URL}${p}</loc><lastmod>${today}</lastmod><changefreq>${
              p === "/" || p === "/menu" ? "daily" : "monthly"
            }</changefreq><priority>${p === "/" ? "1.0" : p === "/menu" ? "0.9" : "0.5"}</priority></url>`
        ).join("\n");

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
