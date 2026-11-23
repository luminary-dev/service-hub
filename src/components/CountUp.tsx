"use client";

import { useEffect, useState } from "react";

// Animated count-up (#907) for stat tiles: eases from the previous value to
// the next one whenever `value` changes, instead of just snapping.
export default function CountUp({
  value,
  durationMs = 800,
  padLength = 2,
}: {
  value: number;
  durationMs?: number;
  padLength?: number;
}) {
  const [display, setDisplay] = useState(value);
  // The last value `display` has been (or is being) reconciled to. Plain
  // state rather than a ref, so it's safe to read/write during render below.
  const [reconciled, setReconciled] = useState(value);

  // Render-time derived state (no animation to run): jump straight to the
  // new value under prefers-reduced-motion, instead of animating via effect.
  if (value !== reconciled) {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setReconciled(value);
      setDisplay(value);
    }
  }

  useEffect(() => {
    if (reconciled === value) return; // handled above, or unchanged
    const from = display;
    const to = value;
    const start = performance.now();
    let raf = 0;
    function tick(now: number) {
      const elapsed = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (elapsed < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setReconciled(to);
      }
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // `display`/`reconciled` are read only as the animation's starting
    // snapshot when `value` changes, not reactive dependencies of the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  return <>{String(display).padStart(padLength, "0")}</>;
}
