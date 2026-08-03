import { lazy, Suspense, useEffect, useState } from "react";
import vanAsset from "../assets/van.json.asset.json";

const Lottie = lazy(() =>
  import("lottie-react").then((m) => ({ default: m.default })),
);

export function HomeVanBanner() {
  const [visible, setVisible] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [animationData, setAnimationData] = useState<object | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    fetch(vanAsset.url)
      .then((res) => res.json())
      .then(setAnimationData)
      .catch((err) => console.error("Failed to load van animation:", err));
  }, []);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-[170px] overflow-hidden sm:h-[200px]"
      aria-hidden="true"
    >
      <div
        className="knb-banner-drive absolute bottom-2 left-0 w-[180px] sm:w-[280px]"
        style={{ animation: "knb-drive-across 14s linear infinite" }}
      >
        <div className="knb-bubble relative mx-auto mb-1 w-fit max-w-[160px] rounded-2xl border-2 border-foreground bg-card px-3 py-1.5 text-center text-[11px] font-bold uppercase leading-tight tracking-wide text-foreground shadow-[3px_3px_0_var(--foreground)] sm:max-w-none sm:text-[13px]">
          We&apos;re on our way!
          <span className="absolute -bottom-[9px] left-6 size-0 border-x-8 border-t-[10px] border-x-transparent border-t-foreground" />
          <span className="absolute -bottom-[6px] left-[26px] size-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-card" />
        </div>
        {mounted && (
          <Suspense fallback={null}>
            {animationData ? (
              <Lottie
                animationData={animationData}
                loop
                autoplay
                style={{ width: "100%", height: "auto", maxHeight: 180 }}
              />
            ) : null}
          </Suspense>
        )}
      </div>

      <button
        type="button"
        aria-label="Hide delivery van animation"
        onClick={() => setVisible(false)}
        className="pointer-events-auto absolute top-3 right-3 rounded-full bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur hover:text-foreground"
      >
        Hide
      </button>

      <style>{`
        @keyframes knb-drive-across {
          from { transform: translateX(-300px); }
          to   { transform: translateX(calc(100vw + 40px)); }
        }
        @keyframes knb-bubble-bob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-4px); }
        }
        .knb-bubble { animation: knb-bubble-bob 1.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .knb-banner-drive { animation: none; display: none; }
          .knb-bubble { animation: none; }
        }
      `}</style>
    </div>
  );
}

export default HomeVanBanner;
