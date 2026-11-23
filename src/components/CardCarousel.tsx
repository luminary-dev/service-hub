"use client";

import { useRef, type ReactNode } from "react";
import { FaChevronLeft, FaChevronRight } from "@/components/icons";

// Horizontally-scrolling card carousel (#912): a native scroll-snap track
// (so touch swipe and trackpad scroll just work) with a Prev/Next button pair
// that page it by one viewport-width at a time. Deliberately no autoplay —
// unlike the hero's decorative slider, these cards are interactive links, and
// autoplay would drag focus/hover out from under a reading user.
export default function CardCarousel({
  children,
  prevLabel,
  nextLabel,
}: {
  children: ReactNode;
  prevLabel: string;
  nextLabel: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  function page(direction: 1 | -1) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: "smooth" });
  }

  return (
    <div>
      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-2"
      >
        {children}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => page(-1)}
          aria-label={prevLabel}
          className="btn-secondary !p-2.5"
        >
          <FaChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => page(1)}
          aria-label={nextLabel}
          className="btn-secondary !p-2.5"
        >
          <FaChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
