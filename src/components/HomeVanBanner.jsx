import { useState } from "react";
import Lottie from "lottie-react";
import vanAnimation from "../assets/van.json";

export function HomeVanBanner() {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-[120px] overflow-hidden"
      aria-hidden="true"
    >
      <div
        className="knb-banner-drive absolute bottom-2 left-0 w-[280px]"
        style={{ animation: "knb-drive-across 14s linear infinite" }}
      >
        <Lottie animationData={vanAnimation} loop autoplay />
      </div>

      <button
        type="button"
        aria-label="Hide delivery van animation"
        onClick={() => setVisible(false)}
        className="pointer-events-auto absolute bottom-3 right-3 rounded-full bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur hover:text-foreground"
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
