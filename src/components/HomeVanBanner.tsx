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
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-[170px] overflow-x-hidden overflow-y-visible sm:h-[200px]"
      aria-hidden="true"
    >
      <div
        className="knb-banner-drive absolute bottom-2 left-0 w-[180px] sm:w-[280px]"
        style={{ animation: "knb-drive-across 14s linear infinite", position: "absolute" }}
      >
        <div style={{ position: "relative" }}>
          <div
            className="knb-bubble"
            style={{
              position: "absolute",
              top: "38%",
              right: "6%",
              zIndex: 1,
              maxWidth: 180,
              minHeight: 30,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 14,
              border: "2px solid #1a1a1a",
              background: "#fff",
              color: "#1a1a1a",
              padding: "5px 12px",
              fontSize: 11,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.02em",
              textAlign: "center",
              lineHeight: 1.2,
              whiteSpace: "nowrap",
              boxShadow: "3px 3px 0 #1a1a1a",
            }}
          >
            We&apos;re on our way!!
            <span
              style={{
                position: "absolute",
                bottom: -8,
                left: 18,
                width: 0,
                height: 0,
                borderLeft: "7px solid transparent",
                borderRight: "7px solid transparent",
                borderTop: "9px solid #1a1a1a",
              }}
            />
            <span
              style={{
                position: "absolute",
                bottom: -5,
                left: 20,
                width: 0,
                height: 0,
                borderLeft: "5px solid transparent",
                borderRight: "5px solid transparent",
                borderTop: "7px solid #fff",
              }}
            />
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
