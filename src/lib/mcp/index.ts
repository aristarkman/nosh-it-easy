import { defineMcp } from "@lovable.dev/mcp-js";
import listLocationsTool from "./tools/list-locations";
import listCategoriesTool from "./tools/list-categories";
import getMenuTool from "./tools/get-menu";
import searchMenuTool from "./tools/search-menu";

export default defineMcp({
  name: "kosher-nosh-mcp",
  title: "The Famous Kosher Nosh",
  version: "0.1.0",
  instructions:
    "Public, read-only tools for The Famous Kosher Nosh deli (Glen Rock and Cresskill, NJ). Use `list_locations` for store addresses and phone numbers, `list_categories` for menu sections, `get_menu` for full menu with per-location prices and availability, and `search_menu` to find specific items by keyword. All items include an `ordering_url` where customers can place a takeout or delivery order.",
  tools: [listLocationsTool, listCategoriesTool, getMenuTool, searchMenuTool],
});
