import { useState } from "react";
import Lottie from "lottie-react";
import vanAnimation from "./van.json"; // exported from LottieFiles

/**
 * Kosher Nosh — homepage banner.
 * Plays the van animation once, sliding across the bottom of the
 * screen, then unmounts itself. Drop <HomeVanBanner /> anywhere in
 * your homepage route/layout.
 */
export function HomeVanBanner() {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div className="knb-banner-track" aria-hidden="true">
      <div
        className="knb-banner-drive"
        onAnimationEnd={() => setVisible(false)}
      >
        <Lottie
          animationData={vanAnimation}
          loop={false}
          autoplay
          style={{ width: 320, height: 240 }}
        />
      </div>

      <style>{`
        .knb-banner-track {
          position: fixed;
          left: 0;
          bottom: 0;
          width: 100%;
          height: 240px;
          overflow: hidden;
          pointer-events: none;
          z-index: 40;
        }
        .knb-banner-drive {
          position: absolute;
          bottom: 0;
          left: 0;
          animation: knb-drive-across 5.5s cubic-bezier(.4,0,.6,1) forwards;
        }
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
