"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { FaChevronLeft, FaChevronRight, FaXmark } from "react-icons/fa6";

type Photo = { id: string; url: string; caption: string | null };

export default function PhotoGallery({ photos }: { photos: Photo[] }) {
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (active === null) return;
      if (e.key === "Escape") setActive(null);
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
            onClick={() => setActive(i)}
            aria-label={p.caption ? `View photo: ${p.caption}` : "View photo"}
            className="group relative aspect-square cursor-pointer overflow-hidden rounded-xl bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            <img
              src={p.url}
              alt={p.caption ?? "Work photo"}
              className="h-full w-full object-cover transition group-hover:scale-105"
            />
            {p.caption && (
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-8 text-left text-xs text-white">
                {p.caption}
              </span>
            )}
          </button>
        ))}
      </div>

      {active !== null && photos[active] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setActive(null)}
        >
          <button
            aria-label="Close photo viewer"
            className="absolute right-5 top-5 cursor-pointer text-white/70 transition hover:text-white"
            onClick={() => setActive(null)}
          >
            <FaXmark className="h-7 w-7" />
          </button>
          {photos.length > 1 && (
            <>
              <button
                aria-label="Previous photo"
                className="absolute left-4 cursor-pointer text-white/70 transition hover:text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  setActive((active - 1 + photos.length) % photos.length);
                }}
              >
                <FaChevronLeft className="h-8 w-8" />
              </button>
              <button
                aria-label="Next photo"
                className="absolute right-4 cursor-pointer text-white/70 transition hover:text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  setActive((active + 1) % photos.length);
                }}
              >
                <FaChevronRight className="h-8 w-8" />
              </button>
            </>
          )}
          <figure
            className="max-h-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={photos[active].url}
              alt={photos[active].caption ?? "Work photo"}
              className="max-h-[80vh] w-auto rounded-xl object-contain"
            />
            {photos[active].caption && (
              <figcaption className="mt-3 text-center text-sm text-white/80">
                {photos[active].caption}
              </figcaption>
            )}
          </figure>
        </div>
      )}
    </>
  );
}
