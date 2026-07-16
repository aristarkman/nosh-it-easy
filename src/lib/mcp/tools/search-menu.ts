import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { fetchMenuFeed } from "../menu-feed";

export default defineTool({
  name: "search_menu",
  title: "Search menu",
  description:
    "Search The Famous Kosher Nosh menu by keyword. Matches item names, descriptions, and category names (case-insensitive). Returns matching items with price, availability, and ordering URL.",
  inputSchema: {
    query: z
      .string()
      .min(1)
      .max(120)
      .describe("Keyword or phrase to search for (e.g. 'brisket', 'gluten free', 'soup')."),
    location: z
      .enum(["glen-rock", "cresskill"])
      .optional()
      .describe("Restrict prices/availability to a single store location."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, location }) => {
    const feed = await fetchMenuFeed({ location });
    const q = query.toLowerCase();
    const matches = feed.items.filter((it) => {
      const hay = `${it.name} ${it.short_description ?? ""} ${it.category_slug ?? ""} ${it.dietary_labels.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
    const items = matches.map((it) => ({
      slug: it.slug,
      name: it.name,
      description: it.short_description,
      category_slug: it.category_slug,
      dietary_labels: it.dietary_labels,
      image_url: it.image_url,
      ordering_url: it.ordering_url,
      locations: it.locations,
    }));
    return {
      content: [
        {
          type: "text",
          text:
            items.length === 0
              ? `No menu items match "${query}".`
              : JSON.stringify(items, null, 2),
        },
      ],
      structuredContent: { count: items.length, items },
    };
  },
});
