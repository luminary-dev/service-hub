"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { FaChevronLeft, FaChevronRight, FaXmark } from "@/components/icons";
import { isSvg } from "@/lib/image";
import Dialog from "@/components/ui/Dialog";
import { useT } from "./I18nProvider";
import ReportButton from "./ReportButton";

type Photo = { id: string; url: string; caption: string | null };

// Minimum horizontal travel (px) for a touch to count as a swipe rather than
// a tap; it must also be more horizontal than vertical.
const SWIPE_THRESHOLD = 40;

export default function PhotoGallery({ photos }: { photos: Photo[] }) {
  const [active, setActive] = useState<number | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Tracked explicitly (not via document.activeElement) because Safari does
  // not focus a <button> on click; Dialog restores focus here on close.
  const openerRef = useRef<HTMLElement | null>(null);
  const t = useT();

  function showPrev() {
    setActive((a) => ((a ?? 0) - 1 + photos.length) % photos.length);
  }

  function showNext() {
    setActive((a) => ((a ?? 0) + 1) % photos.length);
  }

  function onTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || photos.length < 2) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;
    if (dx < 0) showNext();
    else showPrev();
  }

  // Arrow-key navigation while the lightbox is open (Escape is handled by
  // the Dialog primitive).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (active === null) return;
      if (e.key === "ArrowRight") setActive((a) => ((a ?? 0) + 1) % photos.length);
      if (e.key === "ArrowLeft")
        setActive((a) => ((a ?? 0) - 1 + photos.length) % photos.length);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, photos.length]);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={(e) => {
              openerRef.current = e.currentTarget;
              setActive(i);
            }}
            aria-label={
              p.caption
                ? t.profile.viewPhotoCaption(p.caption)
                : t.profile.viewPhoto
            }
            className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg border border-ink-200 bg-ink-100 transition-[border-color,transform] duration-200 ease-snap hover:-translate-y-0.5 hover:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            <Image
              src={p.url}
              alt={p.caption ?? t.profile.workPhoto}
              fill
              sizes="(min-width: 640px) 33vw, 50vw"
              unoptimized={isSvg(p.url)}
              className="object-cover transition group-hover:scale-105"
            />
            {p.caption && (
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-8 text-left font-mono text-[11px] uppercase tracking-wide text-white">
                {p.caption}
              </span>
            )}
          </button>
        ))}
      </div>

      {active !== null && photos[active] && (
        <Dialog
          onClose={() => setActive(null)}
          label={t.profile.photoViewer}
          overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          initialFocus={closeRef}
          restoreFocus={openerRef}
          overlayProps={{ onTouchStart, onTouchEnd }}
        >
          <button
            ref={closeRef}
            type="button"
            aria-label={t.profile.closePhoto}
            className="absolute right-5 top-5 cursor-pointer text-white/70 transition hover:text-white"
            onClick={() => setActive(null)}
          >
            <FaXmark className="h-7 w-7" />
          </button>
          {photos.length > 1 && (
            <>
              <button
                type="button"
                aria-label={t.profile.prevPhoto}
                className="absolute left-2 z-10 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white/80 transition hover:text-white sm:left-4 sm:h-auto sm:w-auto sm:bg-transparent"
                onClick={(e) => {
                  e.stopPropagation();
                  showPrev();
                }}
              >
                <FaChevronLeft className="h-6 w-6 sm:h-8 sm:w-8" />
              </button>
              <button
                type="button"
                aria-label={t.profile.nextPhoto}
                className="absolute right-2 z-10 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white/80 transition hover:text-white sm:right-4 sm:h-auto sm:w-auto sm:bg-transparent"
                onClick={(e) => {
                  e.stopPropagation();
                  showNext();
                }}
              >
                <FaChevronRight className="h-6 w-6 sm:h-8 sm:w-8" />
              </button>
            </>
          )}
          <figure
            className="flex max-h-full w-full max-w-4xl flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative h-[80vh] w-full">
              <Image
                src={photos[active].url}
                alt={photos[active].caption ?? t.profile.workPhoto}
                fill
                sizes="100vw"
                unoptimized={isSvg(photos[active].url)}
                className="rounded-xl object-contain"
              />
            </div>
            {photos[active].caption && (
              <figcaption className="mt-3 text-center text-sm text-white/80">
                {photos[active].caption}
              </figcaption>
            )}
            <div className="mt-3">
              <ReportButton
                endpoint={`/api/photos/${photos[active].id}/report`}
                label={t.report.reportPhoto}
                variant="overlay"
              />
            </div>
          </figure>
        </Dialog>
      )}
    </>
  );
}
