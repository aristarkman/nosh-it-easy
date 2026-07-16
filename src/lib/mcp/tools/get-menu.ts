import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { fetchMenuFeed } from "../menu-feed";

export default defineTool({
  name: "get_menu",
  title: "Get menu items",
  description:
    "Return active menu items for The Famous Kosher Nosh, including name, description, category, dietary labels, per-location price, availability, image, and an ordering URL. Optionally filter by store location and/or category slug.",
  inputSchema: {
    location: z
      .enum(["glen-rock", "cresskill"])
      .optional()
      .describe("Restrict prices/availability to a single store location."),
    category: z
      .string()
      .min(1)
      .max(80)
      .optional()
      .describe("Category slug (see list_categories) to filter items."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ location, category }) => {
    const feed = await fetchMenuFeed({ location, category });
    const items = feed.items.map((it) => ({
      slug: it.slug,
      name: it.name,
      description: it.short_description,
      category_slug: it.category_slug,
      featured: it.featured,
      dietary_labels: it.dietary_labels,
      image_url: it.image_url,
      ordering_url: it.ordering_url,
      locations: it.locations.map((l) => ({
        location_id: l.location_id,
        available: l.available,
        price: l.price,
        price_display_text: l.price_display_text,
      })),
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
      structuredContent: { count: items.length, items },
    };
  },
});
