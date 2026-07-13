"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { FaChevronLeft, FaChevronRight } from "@/components/icons";
import { useT } from "./I18nProvider";

// Paired 1:1 with the localized alt/caption entries in `home.heroSlides`.
const SLIDE_SRCS = [
  "/images/workers/hero-worker2.jpg",
  "/images/workers/mechanic-1.jpg",
  "/images/workers/electrician-1.jpg",
  "/images/workers/plumber-1.jpg",
];

const ADVANCE_MS = 5000;

// Home-hero crossfade slider (#447). Auto-advances unless hovered, focused or
// the visitor prefers reduced motion; manual controls always work. The first
// slide is preloaded so the LCP image behaves exactly like the old static one.
export default function HeroSlider() {
  const t = useT();
  const count = SLIDE_SRCS.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reducedMotion || paused) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), ADVANCE_MS);
    return () => clearInterval(id);
  }, [reducedMotion, paused, count]);

  const goTo = (i: number) => setIndex(((i % count) + count) % count);

  return (
    <figure
      className="relative"
      role="group"
      aria-roledescription="carousel"
      aria-label={t.home.heroCarouselLabel}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
      }}
    >
      <div className="tech-corners relative aspect-[4/5] overflow-hidden border border-ink-300 bg-ink-100">
        {SLIDE_SRCS.map((src, i) => (
          <div
            key={src}
            role="group"
            aria-roledescription="slide"
            aria-label={t.home.heroSlideOf(i + 1, count)}
            aria-hidden={i !== index}
            className={`absolute inset-0 transition-opacity duration-700 ease-flow motion-reduce:transition-none ${
              i === index ? "opacity-100" : "opacity-0"
            }`}
          >
            <Image
              src={src}
              alt={t.home.heroSlides[i]?.alt ?? ""}
              fill
              preload={i === 0}
              loading={i === 0 ? undefined : "lazy"}
              sizes="(min-width: 1024px) 460px, 100vw"
              className={`object-cover object-center ${i === index ? "kenburns" : ""}`}
            />
          </div>
        ))}
        <div className="blueprint-grid pointer-events-none absolute inset-0 opacity-30 mix-blend-overlay" />
        <span className="absolute left-3 top-3 rounded-sm bg-brand-700 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-white dark:text-ink-50">
          Verified trade
        </span>
      </div>
      <figcaption className="flex items-center gap-3 border border-t-0 border-ink-300 bg-ink-100 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-500">
        <span className="tabular-nums">
          Fig.{String(index + 1).padStart(2, "0")}
        </span>
        {/* Polite only while rotation is stopped, so autoplay never spams SRs. */}
        <span
          className="min-w-0 flex-1 truncate"
          aria-live={paused || reducedMotion ? "polite" : "off"}
          aria-atomic="true"
        >
          {t.home.heroSlides[index]?.caption}
        </span>
        <span className="flex items-center gap-1" role="group">
          {SLIDE_SRCS.map((src, i) => (
            <button
              key={src}
              type="button"
              aria-label={t.home.heroGoTo(i + 1)}
              aria-current={i === index}
              onClick={() => goTo(i)}
              className={`h-3.5 w-2 border transition-colors duration-200 ease-snap ${
                i === index
                  ? "border-brand-600 bg-brand-600"
                  : "border-ink-300 bg-surface hover:border-brand-400"
              }`}
            />
          ))}
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            aria-label={t.home.heroPrev}
            onClick={() => goTo(index - 1)}
            className="flex h-6 w-6 items-center justify-center border border-ink-300 bg-surface text-ink-600 transition-colors duration-200 ease-snap hover:border-brand-400 hover:text-brand-700"
          >
            <FaChevronLeft className="h-3 w-3" />
          </button>
          <button
            type="button"
            aria-label={t.home.heroNext}
            onClick={() => goTo(index + 1)}
            className="flex h-6 w-6 items-center justify-center border border-ink-300 bg-surface text-ink-600 transition-colors duration-200 ease-snap hover:border-brand-400 hover:text-brand-700"
          >
            <FaChevronRight className="h-3 w-3" />
          </button>
        </span>
      </figcaption>
    </figure>
  );
}
