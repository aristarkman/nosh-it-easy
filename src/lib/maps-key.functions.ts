import { createServerFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";

// Returns the right browser key for the current host.
// Custom domains (e.g. takeout.koshernosh.com) use the user-provided key
// (GOOGLE_MAPS_BROWSER_KEY_1); *.lovable.app / lovableproject.com use the
// managed key (GOOGLE_MAPS_BROWSER_KEY).
export const getMapsBrowserKey = createServerFn({ method: "GET" }).handler(async () => {
  let host = "";
  try {
    host = getRequestHost() ?? "";
  } catch {
    host = "";
  }
  const isLovableHost =
    host.endsWith(".lovable.app") ||
    host.endsWith(".lovableproject.com") ||
    host === "localhost" ||
    host.startsWith("localhost:");

  const managed = process.env.GOOGLE_MAPS_BROWSER_KEY ?? "";
  const custom = process.env.GOOGLE_MAPS_BROWSER_KEY_1 ?? "";
  const trackingId = process.env.GOOGLE_MAPS_TRACKING_ID ?? "";

  const key = isLovableHost ? managed || custom : custom || managed;
  return { key, trackingId };
});
