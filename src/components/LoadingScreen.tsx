import { dict } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

// Branded full-screen loading splash (#793). Shown as the root loading.tsx
// fallback during initial navigation — distinct from the per-route skeletons
// (#381), which mirror a specific page's layout while its data streams. This
// is layout-neutral and on-brand: the Baas.lk logomark over the wordmark, a
// localized tagline, and three staggered activity dots.
//
// It reuses existing brand tokens and animation utilities from globals.css
// (`.floaty`, `.pulse-dot`) — both already frozen under prefers-reduced-motion,
// so no extra motion handling is needed here. Server component: reads the
// active locale so the copy matches EN / /si like the rest of the app.
export default async function LoadingScreen() {
  const t = dict[await getLocale()].loading;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-7 bg-ink-50 px-6 text-center"
    >
      <span
        aria-hidden
        className="floaty flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-700 font-display text-3xl font-bold text-white shadow-lg dark:text-ink-50"
      >
        B
      </span>

      <div className="flex flex-col items-center gap-3">
        <span
          aria-hidden
          className="font-display text-xl font-bold tracking-tight text-ink-900"
        >
          Baas<span className="text-brand-600">.lk</span>
        </span>
        <p aria-hidden className="max-w-xs text-sm text-ink-500">
          {t.tagline}
        </p>
      </div>

      <span aria-hidden className="flex items-center gap-1.5">
        {[0, 200, 400].map((delay) => (
          <span
            key={delay}
            className="pulse-dot h-1.5 w-1.5 rounded-full bg-brand-600"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>

      <span className="sr-only">{t.label}</span>
    </div>
  );
}
