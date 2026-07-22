import { useEffect, useRef } from "react";

const MAX_UPTIME_MS = 3 * 60 * 60 * 1000; // 3h continuous runtime
const HIDDEN_STALE_MS = 3 * 60 * 1000; // tab hidden >3min = treat as stale on return

/**
 * Kiosk tablets (Fire tablets especially) aggressively suspend/throttle
 * background browser tabs to save memory, which can silently kill the
 * Supabase realtime WebSocket with no visible error -- new orders just
 * stop flowing in, so auto-accept/auto-print/the alarm all go quiet at
 * once with nothing on screen indicating a problem. A full page reload is
 * the most reliable fix (fresh WebSocket, fresh audio-unlock via the
 * first-tap listener, fresh everything) -- this automates exactly what
 * staff would otherwise have to notice and do manually:
 *
 *   1. Reload if the tab was hidden for a few minutes and just became
 *      visible again -- the classic "tablet screen was off/backgrounded"
 *      case, and the most likely cause of what actually happened.
 *   2. Reload after a few hours of continuous uptime regardless, as a
 *      periodic reset against any other slow drift even if the tab never
 *      visibly went hidden.
 */
export function useAutoReloadWatchdog() {
  const hiddenSinceRef = useRef<number | null>(null);

  useEffect(() => {
    const uptimeTimer = setTimeout(() => {
      window.location.reload();
    }, MAX_UPTIME_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenSinceRef.current = Date.now();
        return;
      }
      const hiddenSince = hiddenSinceRef.current;
      hiddenSinceRef.current = null;
      if (hiddenSince && Date.now() - hiddenSince > HIDDEN_STALE_MS) {
        window.location.reload();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearTimeout(uptimeTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
}
