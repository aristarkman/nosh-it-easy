import { useEffect, useRef, useState } from "react";

const UNLOCK_STORAGE_KEY = "tablet-alarm-unlocked";
// Orders that were already pending before this page load finished mounting
// don't deserve an instant re-blast just because the tab reloaded (manual
// refresh, or the auto-reload watchdog) -- that produces exactly the "every
// time the screen refreshes the alert goes off" complaint, since a reload
// has no memory of "I was already alarming about this." Grace period gives
// auto-accept (Glen Rock) a moment to catch up, and for genuinely
// still-pending orders (Cresskill), just delays the restart briefly rather
// than firing the instant sound unlocks.
const STARTUP_GRACE_MS = 4000;

/**
 * Escalating alarm that loops while `pendingCount > 0`.
 * - Starts gentle, gets louder/faster the longer it's ignored.
 * - Stops the moment all new orders are accepted/cancelled.
 * - Requires a one-time user gesture (browsers block autoplay) -- but if
 *   we know from a prior visit that this device has already granted that
 *   gesture, we eagerly try to resume without waiting for a fresh tap.
 */
export function useNewOrderAlarm(pendingCount: number) {
  const ctxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const mountedAtRef = useRef<number>(Date.now());
  const [enabled, setEnabled] = useState(false);
  const [needsUnlock, setNeedsUnlock] = useState(false);

  const playBeep = (volume: number, freq: number, duration: number) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.value = 0;
    osc.connect(gain).connect(ctx.destination);
    const t0 = ctx.currentTime;
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
    gain.gain.linearRampToValueAtTime(0, t0 + duration);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  };

  const enable = (silent = false) => {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      if (!ctxRef.current) ctxRef.current = new Ctx();
      ctxRef.current?.resume();
      setEnabled(true);
      setNeedsUnlock(false);
      try {
        window.localStorage.setItem(UNLOCK_STORAGE_KEY, "1");
      } catch {
        // localStorage unavailable (private browsing, etc.) -- non-fatal
      }
      // Tiny click so a real (non-silent) unlock confirms audio is working.
      if (!silent) playBeep(0.05, 880, 0.08);
    } catch {
      // AudioContext unsupported or blocked -- needsUnlock stays true, tap-to-unlock fallback handles it
    }
  };

  // Detect whether we need an unlock gesture, and if this device has
  // granted one before, try an eager silent resume right away -- many
  // browsers allow this once an origin has prior media engagement, so in
  // practice this often means no tap is needed at all on repeat visits.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setNeedsUnlock(true);
    let hadPriorUnlock = false;
    try {
      hadPriorUnlock = window.localStorage.getItem(UNLOCK_STORAGE_KEY) === "1";
    } catch {
      // localStorage unavailable -- falls back to requiring a fresh tap
    }
    if (hadPriorUnlock) enable(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const stop = () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      startedAtRef.current = 0;
    };

    if (!enabled || pendingCount <= 0) {
      stop();
      return;
    }

    if (intervalRef.current) return; // already running

    const sinceMount = Date.now() - mountedAtRef.current;
    const startDelay = Math.max(0, STARTUP_GRACE_MS - sinceMount);

    const startTimer = window.setTimeout(() => {
      startedAtRef.current = Date.now();

      const tick = () => {
        const elapsed = (Date.now() - startedAtRef.current) / 1000;
        // Escalation: 0-15s gentle, 15-45s firm, 45s+ urgent
        let volume = 0.35;
        let freq = 880;
        let pulses = 3;
        if (elapsed > 15) {
          volume = 0.55;
          pulses = 4;
        }
        if (elapsed > 45) {
          volume = 0.85;
          freq = 1100;
          pulses = 5;
        }
        if (elapsed > 90) {
          volume = 1.0;
          freq = 1320;
          pulses = 6;
        }
        for (let i = 0; i < pulses; i++) {
          setTimeout(() => playBeep(volume, freq, 0.35), i * 380);
        }
      };

      tick();
      // Repeat every ~3s, faster as it escalates
      intervalRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - startedAtRef.current) / 1000;
        const period = elapsed > 45 ? 1500 : elapsed > 15 ? 2200 : 3000;
        tick();
        // dynamic period
        if (intervalRef.current) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = window.setInterval(tick, period);
        }
      }, 3000);
    }, startDelay);

    return () => {
      window.clearTimeout(startTimer);
      stop();
    };
  }, [enabled, pendingCount]);

  return { enabled, needsUnlock, enable: () => enable(false) };
}
