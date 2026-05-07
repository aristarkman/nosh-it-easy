import { useEffect, useRef, useState } from "react";

/**
 * Escalating alarm that loops while `pendingCount > 0`.
 * - Starts gentle, gets louder/faster the longer it's ignored.
 * - Stops the moment all new orders are accepted/cancelled.
 * - Requires a one-time user gesture (browsers block autoplay).
 */
export function useNewOrderAlarm(pendingCount: number) {
  const ctxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const [enabled, setEnabled] = useState(false);
  const [needsUnlock, setNeedsUnlock] = useState(false);

  // Detect whether we need an unlock gesture
  useEffect(() => {
    if (typeof window === "undefined") return;
    setNeedsUnlock(true);
  }, []);

  const enable = () => {
    try {
      const Ctx =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      if (!ctxRef.current) ctxRef.current = new Ctx();
      ctxRef.current?.resume();
      setEnabled(true);
      setNeedsUnlock(false);
      // Tiny click so user knows it worked
      playBeep(0.05, 880, 0.08);
    } catch {}
  };

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

    startedAtRef.current = Date.now();

    const tick = () => {
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      // Escalation: 0-15s gentle, 15-45s firm, 45s+ urgent
      let volume = 0.15;
      let freq = 880;
      let pulses = 2;
      if (elapsed > 15) {
        volume = 0.35;
        pulses = 3;
      }
      if (elapsed > 45) {
        volume = 0.7;
        freq = 1100;
        pulses = 4;
      }
      if (elapsed > 90) {
        volume = 1.0;
        freq = 1320;
        pulses = 5;
      }
      for (let i = 0; i < pulses; i++) {
        setTimeout(() => playBeep(volume, freq, 0.18), i * 220);
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

    return stop;
  }, [enabled, pendingCount]);

  return { enabled, needsUnlock, enable };
}
