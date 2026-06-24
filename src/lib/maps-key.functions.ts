import { createServerFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";

const CUSTOM_DOMAIN_SUFFIXES = ["koshernosh.com"];

function normalizeHost(host: string) {
  return host
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
}

// Returns the right browser key for the current host.
// Custom domains (e.g. takeout.koshernosh.com) use the user-provided key
// when available; local preview and *.lovable.app / lovableproject.com use
// the managed key first.
export const getMapsBrowserKey = createServerFn({ method: "GET" }).handler(async () => {
  let host = "";
  try {
    host = normalizeHost(getRequestHost() ?? "");
  } catch {
    host = "";
  }
  const isLocalHost = host === "localhost" || host.startsWith("localhost:");
  const isLovableHost =
    host.endsWith(".lovable.app") ||
    host.endsWith(".lovableproject.com");

  const managed =
    process.env.GOOGLE_MAPS_BROWSER_KEY ||
    process.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY ||
    "";
  const custom =
    process.env.GOOGLE_MAPS_BROWSER_KEY_2 ||
    process.env.GOOGLE_MAPS_BROWSER_KEY_1 ||
    "";
  const trackingId =
    process.env.GOOGLE_MAPS_TRACKING_ID ||
    process.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID ||
    "";

  const isKnownCustomDomain = CUSTOM_DOMAIN_SUFFIXES.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
  const key = (isLovableHost || isLocalHost) && !isKnownCustomDomain ? managed || custom : custom || managed;
  return { key, trackingId };
});
