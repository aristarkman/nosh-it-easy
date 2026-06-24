/// <reference types="google.maps" />
// Singleton loader for the Google Maps JS API with the drawing library
let loadPromise: Promise<typeof google> | null = null;

declare global {
  interface Window {
    __gmapsInit?: () => void;
    google: typeof google;
  }
}

import { getMapsBrowserKey } from "./maps-key.functions";

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.google?.maps?.drawing?.DrawingManager && window.google.maps.geometry) {
    return Promise.resolve(window.google);
  }
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const { key, trackingId } = await getMapsBrowserKey();
    if (!key) throw new Error("Google Maps browser key missing");
    return new Promise<typeof google>((resolve, reject) => {
      // Google calls window.gm_authFailure when the API key is rejected
      // (e.g. RefererNotAllowedMapError). Without this the script "loads"
      // but the callback never fires, so any UI gated on map-ready hangs.
      (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
        reject(
          new Error(
            `Google Maps rejected this domain (${window.location.host}). Check that your API key's HTTP referrer allowlist includes this domain.`,
          ),
        );
      };
      window.__gmapsInit = () => {
        if (!window.google?.maps?.drawing?.DrawingManager || !window.google.maps.geometry) {
          reject(new Error("Google Maps drawing tools did not load"));
          return;
        }
        resolve(window.google);
      };
      const s = document.createElement("script");
      const params = new URLSearchParams({
        key,
        loading: "async",
        libraries: "drawing,geometry",
        callback: "__gmapsInit",
      });
      if (trackingId) params.set("channel", trackingId);
      s.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
      s.async = true;
      s.defer = true;
      s.onerror = () => reject(new Error("Failed to load Google Maps"));
      document.head.appendChild(s);
    });
  })().catch((error) => {
    loadPromise = null;
    throw error;
  });
  return loadPromise;
}
