import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { fetchMenuFeed } from "../menu-feed";

export default defineTool({
  name: "list_categories",
  title: "List menu categories",
  description:
    "List the active menu categories offered at The Famous Kosher Nosh, with their slug, description, and display order. Optionally filter to a specific location.",
  inputSchema: {
    location: z
      .enum(["glen-rock", "cresskill"])
      .optional()
      .describe("Restrict to a single store location."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ location }) => {
    const feed = await fetchMenuFeed({ location });
    const categories = feed.categories.map((c) => ({
      slug: c.slug,
      name: c.name,
      description: c.description,
      display_order: c.display_order,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(categories, null, 2) }],
      structuredContent: { categories },
    };
  },
});
