"use client";

import { FaShareNodes } from "@/components/icons";
import { useT } from "./I18nProvider";
import { useToast } from "./ToastProvider";

// Share the current page: native share sheet where supported (mostly mobile),
// otherwise copy the link to the clipboard and confirm with a toast.
export default function ShareButton({ title }: { title: string }) {
  const t = useT();
  const toast = useToast();

  async function share() {
    const url = window.location.href;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        // User dismissed the share sheet — not an error.
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Otherwise fall through to the clipboard fallback.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t.profile.shareCopied);
    } catch {
      toast.error(t.profile.shareError);
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-ink-300 bg-surface px-4 py-2 text-sm font-semibold text-ink-800 transition-[border-color,background-color] duration-200 ease-snap hover:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
    >
      <FaShareNodes className="h-4 w-4" />
      {t.profile.share}
    </button>
  );
}
