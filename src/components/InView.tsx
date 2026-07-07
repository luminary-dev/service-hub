"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

// Adds an `in` class the first time the element scrolls into view, so CSS can
// run a one-shot entrance (see `.reveal-js` / `.stagger` in globals.css).
// `stagger` cascades the reveal across direct children. Degrades gracefully:
// if IntersectionObserver is missing or motion is reduced, content shows
// immediately (the CSS guards handle the reduced-motion case).
export default function InView({
  as,
  stagger = false,
  className = "",
  children,
}: {
  as?: ElementType;
  stagger?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const Tag = as ?? "div";
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      // Old browser with no IO: reveal immediately. Deferred to a frame so it's
      // a callback rather than a synchronous setState in the effect body.
      const id = requestAnimationFrame(() => setSeen(true));
      return () => cancelAnimationFrame(id);
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`${stagger ? "stagger" : "reveal-js"}${seen ? " in" : ""} ${className}`}
    >
      {children}
    </Tag>
  );
}
