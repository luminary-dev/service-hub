import LoadingBrand from "@/components/LoadingBrand";
import { dict } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

// Guaranteed first-load splash (#793). Mounted once in the root layout so it
// covers the viewport from the very first paint on every hard load / deep
// link, holds briefly, then fades out to reveal the app — the visible branded
// "website is loading" screen that the route-level Suspense fallback
// (LoadingScreen) can't provide, since that only shows while a page is
// actually pending (imperceptible when data is fast).
//
// The dismissal is driven entirely by the `.splash-screen` CSS animation in
// globals.css, so it works before hydration and even with JS disabled (it can
// never get stuck on screen), and is skipped under prefers-reduced-motion.
// Because it lives in the persistent layout, it animates once on the initial
// document render and does not replay on client-side navigations. Server
// component: reads the locale so the copy matches EN / /si.
export default async function SplashScreen() {
  const t = dict[await getLocale()].loading;

  return (
    <div
      role="status"
      aria-live="polite"
      className="splash-screen blueprint-grid fixed inset-0 z-[100] flex items-center justify-center bg-ink-50 px-6"
    >
      <LoadingBrand tagline={t.tagline} label={t.label} />
    </div>
  );
}
