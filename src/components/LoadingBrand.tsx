// Shared brand loading visual (#793): the Baas.lk logomark, wordmark, a
// localized tagline, staggered activity dots, and an sr-only status label.
// Rendered inside both the route-level `LoadingScreen` (Suspense fallback) and
// the first-load `SplashScreen` overlay so the two always look identical.
// Server-safe, no state — the container that wraps it owns the `role="status"`.
export default function LoadingBrand({
  tagline,
  label,
}: {
  tagline: string;
  label: string;
}) {
  return (
    <>
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
          {tagline}
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

      <span className="sr-only">{label}</span>
    </>
  );
}
