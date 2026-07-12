"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { FaChevronLeft, FaChevronRight } from "@/components/icons";
import { useLocale, useT } from "@/components/I18nProvider";
import { categoryLabelLoc } from "@/lib/i18n";

// Hero slider (#447) — a "diagnostic bay" style trade showcase that matches the
// blueprint/technical theme: a framed technical plate with a mono Fig.0N
// caption, a brand scan-line wipe on each change, per-slide Ken Burns drift, a
// segmented tick selector and an auto-advance gauge. rAF-driven so pause (hover
// / focus) and the progress gauge stay perfectly in sync; auto-advance and
// motion are disabled under prefers-reduced-motion.

// Trade slides map to a category slug (localized label) + an existing photo in
// public/images/workers/. Mechanic first — the workshop hero shot.
const SLIDES: { slug: string; src: string }[] = [
  { slug: "mechanic", src: "/images/workers/mechanic-1.jpg" },
  { slug: "electrician", src: "/images/workers/electrician-1.jpg" },
  { slug: "plumber", src: "/images/workers/plumber-1.jpg" },
  { slug: "welder", src: "/images/workers/welder-1.jpg" },
  { slug: "carpenter", src: "/images/workers/carpenter-1.jpg" },
];

const DURATION_MS = 5000;

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
// SSR-safe (server snapshot = false) and lint-clean — no setState-in-effect.
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(REDUCED_QUERY);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false
  );
}

export default function HeroSlider() {
  const t = useT().home;
  const locale = useLocale();
  const reduced = usePrefersReducedMotion();

  const count = SLIDES.length;
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0); // 0..1 for the auto-advance gauge
  const [paused, setPaused] = useState(false);

  const labels = SLIDES.map((s) => categoryLabelLoc(s.slug, locale));

  const go = useCallback(
    (next: number) => {
      setActive((next + count) % count);
      setProgress(0);
    },
    [count]
  );

  // rAF loop: accumulate elapsed time while running, advance at the deadline.
  // Re-runs per slide and on pause/resume (which restarts the current slide's
  // countdown) — keeps the gauge and the advance perfectly in sync.
  useEffect(() => {
    if (reduced || paused) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      acc += now - last;
      last = now;
      if (acc >= DURATION_MS) {
        setActive((a) => (a + 1) % count);
        setProgress(0);
        acc = 0;
      } else {
        setProgress(acc / DURATION_MS);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, reduced, active, count]);

  return (
    <figure
      className="floaty group relative select-none"
      role="group"
      aria-roledescription="carousel"
      aria-label={t.sliderRegion}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          go(active - 1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          go(active + 1);
        }
      }}
    >
      <div className="tech-corners relative aspect-[4/5] overflow-hidden border border-ink-300 bg-ink-100">
        {/* Stacked slides — cross-fade; the active one drifts (Ken Burns). */}
        {SLIDES.map((s, i) => (
          <div
            key={s.slug}
            className={`absolute inset-0 transition-[opacity,transform] duration-700 ease-snap ${
              i === active ? "opacity-100 scale-100" : "opacity-0 scale-[1.05]"
            }`}
            aria-hidden={i !== active}
          >
            <Image
              src={s.src}
              alt={t.sliderPhotoAlt(labels[i])}
              fill
              priority={i === 0}
              sizes="(min-width: 1024px) 460px, 100vw"
              className={`object-cover object-center ${
                i === active && !reduced ? "kenburns" : ""
              }`}
            />
          </div>
        ))}

        {/* Blueprint overlay (matches the rest of the hero). */}
        <div className="blueprint-grid pointer-events-none absolute inset-0 opacity-30 mix-blend-overlay" />

        {/* Brand scan-line wipe, re-triggered per slide change via the key. */}
        <span
          key={active}
          className="hero-sweep pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-brand-500/25 to-transparent"
        />

        {/* Top-left: current trade badge — rises in on each change. */}
        <span
          key={`badge-${active}`}
          className="hero-rise absolute left-3 top-3 rounded-sm bg-brand-700 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-white dark:text-ink-50"
        >
          {labels[active]}
        </span>

        {/* Top-right: live counter — the index number flips in per change. */}
        <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-sm border border-white/25 bg-black/30 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-brand-400" />
          <span key={`count-${active}`} className="hero-rise inline-block tabular-nums">
            {String(active + 1).padStart(2, "0")}
          </span>
          <span className="text-white/50">/ {String(count).padStart(2, "0")}</span>
        </span>

        {/* Prev / next — appear on hover or keyboard focus. */}
        <button
          type="button"
          onClick={() => go(active - 1)}
          aria-label={t.sliderPrev}
          className="group/nav absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-sm border border-white/25 bg-black/35 text-white opacity-0 backdrop-blur-sm transition-all duration-200 ease-snap hover:border-brand-400 hover:bg-brand-600 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 group-hover:opacity-100"
        >
          <FaChevronLeft className="h-3.5 w-3.5 transition-transform duration-200 ease-snap group-hover/nav:-translate-x-0.5" />
        </button>
        <button
          type="button"
          onClick={() => go(active + 1)}
          aria-label={t.sliderNext}
          className="group/nav absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-sm border border-white/25 bg-black/35 text-white opacity-0 backdrop-blur-sm transition-all duration-200 ease-snap hover:border-brand-400 hover:bg-brand-600 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 group-hover:opacity-100"
        >
          <FaChevronRight className="h-3.5 w-3.5 transition-transform duration-200 ease-snap group-hover/nav:translate-x-0.5" />
        </button>

        {/* Auto-advance gauge — a brand line filling across the bottom edge. */}
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/15">
          <div
            className="h-full bg-brand-500 transition-[width] duration-100 ease-linear"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>

      {/* Figcaption plate with the tick selector — mirrors the old Fig.01 bar. */}
      <figcaption className="flex items-center justify-between border border-t-0 border-ink-300 bg-ink-100 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-500">
        <span key={`fig-${active}`} className="hero-rise">
          Fig.{String(active + 1).padStart(2, "0")} ·{" "}
          <span className="text-brand-700">{labels[active]}</span>
        </span>
        <div className="flex items-center gap-1.5" role="tablist" aria-label={t.sliderRegion}>
          {SLIDES.map((s, i) => (
            <button
              key={s.slug}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={t.sliderGoto(i + 1)}
              onClick={() => go(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ease-snap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                i === active
                  ? "hero-tick-active w-5 bg-brand-600"
                  : "w-1.5 bg-ink-300 hover:bg-ink-400"
              }`}
            />
          ))}
        </div>
      </figcaption>

      {/* Screen-reader live announcement of the current slide. */}
      <p className="sr-only" aria-live="polite">
        {t.sliderStatus(active + 1, count, labels[active])}
      </p>
    </figure>
  );
}
