import LoadingBrand from "@/components/LoadingBrand";
import { dict } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

// Branded full-screen loading splash (#793). Shown as the root loading.tsx
// fallback during in-app navigation to a top-level route that suspends —
// distinct from the per-route skeletons (#381), which mirror a specific page's
// layout while its data streams. Layout-neutral and on-brand.
//
// (The guaranteed first-load splash is a separate concern — see SplashScreen,
// mounted in the root layout — because a route-level Suspense fallback only
// appears while something is actually pending, which is imperceptible when
// data resolves quickly.)
//
// Reuses the shared LoadingBrand visual and the .floaty/.pulse-dot utilities
// from globals.css (frozen under prefers-reduced-motion). Server component:
// reads the active locale so the copy matches EN / /si.
export default async function LoadingScreen() {
  const t = dict[await getLocale()].loading;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="blueprint-grid fixed inset-0 z-50 flex items-center justify-center bg-ink-50 px-6"
    >
      <LoadingBrand tagline={t.tagline} label={t.label} />
    </div>
  );
}
