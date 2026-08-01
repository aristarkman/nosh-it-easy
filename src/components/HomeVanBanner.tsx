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
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-[200px] overflow-hidden"
      aria-hidden="true"
    >
      <div
        className="knb-banner-drive absolute bottom-2 left-0 w-[280px]"
        style={{ animation: "knb-drive-across 14s linear infinite" }}
      >
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
          from { transform: translateX(-360px); }
          to   { transform: translateX(calc(100vw + 40px)); }
        }
        @media (prefers-reduced-motion: reduce) {
          .knb-banner-drive { animation: none; display: none; }
        }
      `}</style>
    </div>
  );
}

export default HomeVanBanner;
