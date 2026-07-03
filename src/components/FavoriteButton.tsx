"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FaHeart, FaRegHeart } from "react-icons/fa6";
import { useT } from "./I18nProvider";

export default function FavoriteButton({
  providerId,
  initialFavorited,
  variant = "overlay",
}: {
  providerId: string;
  initialFavorited: boolean;
  variant?: "overlay" | "inline";
}) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, setPending] = useState(false);
  const t = useT();
  const router = useRouter();

  async function toggle(e: React.MouseEvent) {
    // Cards wrap this near a link; never navigate when toggling.
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;

    const next = !favorited;
    setFavorited(next); // optimistic
    setPending(true);
    const res = await fetch(`/api/favorites/${providerId}`, {
      method: next ? "POST" : "DELETE",
    }).catch(() => null);
    setPending(false);

    if (!res || !res.ok) {
      setFavorited(!next); // revert on failure
      return;
    }
    // Keep the account page / server-rendered favourited state in sync.
    router.refresh();
  }

  const label = favorited ? t.card.saved : t.card.save;

  if (variant === "inline") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={favorited}
        aria-label={label}
        className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-ink-300 bg-white px-4 py-2 text-sm font-semibold text-ink-800 transition-[border-color,background-color] duration-200 ease-snap hover:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 disabled:opacity-60"
        disabled={pending}
      >
        {favorited ? (
          <FaHeart className="h-4 w-4 text-brand-600" />
        ) : (
          <FaRegHeart className="h-4 w-4" />
        )}
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={favorited}
      aria-label={label}
      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/95 text-ink-600 shadow-sm backdrop-blur transition-[transform,color] duration-200 ease-snap hover:scale-105 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-60"
      disabled={pending}
    >
      {favorited ? (
        <FaHeart className="h-4 w-4 text-brand-600" />
      ) : (
        <FaRegHeart className="h-4 w-4" />
      )}
    </button>
  );
}
