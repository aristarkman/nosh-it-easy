import { useEffect, useRef } from "react";

/**
 * Keeps the screen from sleeping while the component using this hook is
 * mounted, via the Screen Wake Lock API. The lock is released automatically
 * by the browser whenever the tab is backgrounded (e.g. tablet screen turns
 * off, or the user switches apps), so we re-acquire it on visibilitychange
 * once the page becomes visible again.
 *
 * Silently no-ops on browsers without wakeLock support rather than throwing.
 */
export function useWakeLock(enabled = true) {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!("wakeLock" in navigator)) return;

    let cancelled = false;

    const acquire = async () => {
      try {
        const lock = await (navigator as Navigator & {
          wakeLock: { request: (type: "screen") => Promise<WakeLockSentinel> };
        }).wakeLock.request("screen");
        if (cancelled) {
          void lock.release();
          return;
        }
        lockRef.current = lock;
        lock.addEventListener("release", () => {
          lockRef.current = null;
        });
      } catch (err) {
        // Common causes: low battery power-saving mode, or the tab isn't
        // visible yet — visibilitychange below will retry.
        console.warn("Wake lock request failed:", err);
      }
    };

    void acquire();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && !lockRef.current) {
        void acquire();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, [enabled]);
}
