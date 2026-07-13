import { useEffect } from "react";

// Locks background scrolling while a modal overlay is open. `aria-modal`
// dialogs sit over `fixed inset-0` overlays, so without this wheel/touch
// input still scrolls the page behind them (#565). Restores the previous
// inline value on close so nested/stacked locks unwind correctly.
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}
