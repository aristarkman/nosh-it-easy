import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

const LOCATIONS = [
  {
    id: "glen-rock",
    name: "The Famous Kosher Nosh — Glen Rock",
    address: "230 Rock Rd, Glen Rock, NJ 07452",
    phone: "+1-201-331-0000",
    order_url: "https://takeout.koshernosh.com",
  },
  {
    id: "cresskill",
    name: "The Famous Kosher Nosh — Cresskill",
    address: "27 Union Ave, Cresskill, NJ 07626",
    phone: "+1-201-871-3535",
    order_url: "https://takeout.koshernosh.com",
  },
];

export default defineTool({
  name: "list_locations",
  title: "List store locations",
  description:
    "List the two Famous Kosher Nosh restaurant locations (Glen Rock and Cresskill, NJ) with their address, phone number, and online ordering URL.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => ({
    content: [{ type: "text", text: JSON.stringify(LOCATIONS, null, 2) }],
    structuredContent: { locations: LOCATIONS },
  }),
});

// suppress unused import warning
void z;
