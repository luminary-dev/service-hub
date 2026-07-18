// Shared brand loading visual (#793), styled to match the site's engineering /
// technical-drawing language: a drafting panel with corner brackets and a
// blueprint feel (the container behind it carries `.blueprint-grid`), mono
// "REF" micro-labels, concentric dial rings spinning around the Baas.lk
// logomark, and an animated hazard-stripe progress rail — an "active
// machinery" read rather than a plain spinner.
//
// Used by both the route-level `LoadingScreen` (Suspense fallback) and the
// first-load `SplashScreen` overlay so the two always look identical.
// Server-safe, no state — the container that wraps it owns `role="status"`.
export default function LoadingBrand({
  tagline,
  label,
}: {
  tagline: string;
  label: string;
}) {
  return (
    <div className="tech-corners w-full max-w-sm rounded-xl border border-ink-200 bg-surface/85 px-8 py-9 text-center shadow-sm backdrop-blur-sm">
      {/* Drafting ref header: mono, uppercase, with a live status dot. */}
      <div className="mb-8 flex items-center justify-between font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">
        <span>REF / BAAS.LK</span>
        <span className="flex items-center gap-1.5 text-brand-700">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-brand-600" />
          Online
        </span>
      </div>

      {/* Logomark inside two counter-rotating technical dial rings. */}
      <div
        aria-hidden
        className="relative mx-auto flex h-24 w-24 items-center justify-center"
      >
        <svg
          viewBox="0 0 96 96"
          fill="none"
          className="gear-spin absolute inset-0 h-full w-full text-ink-300"
        >
          <circle
            cx="48"
            cy="48"
            r="45"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="3 7"
          />
        </svg>
        <svg
          viewBox="0 0 96 96"
          fill="none"
          className="gear-spin-rev absolute inset-[10px] h-[calc(100%-20px)] w-[calc(100%-20px)] text-brand-300"
        >
          <circle
            cx="48"
            cy="48"
            r="42"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="12 16"
          />
        </svg>
        <span className="floaty flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-700 font-display text-2xl font-bold text-white shadow-lg dark:text-ink-50">
          B
        </span>
      </div>

      {/* Wordmark + localized tagline. */}
      <div className="mt-7 flex flex-col items-center gap-2">
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

      {/* Hazard-stripe progress rail — the "working" caution band creeps. */}
      <div className="mt-8 h-1.5 w-full overflow-hidden rounded-full ring-1 ring-ink-200">
        <div className="hazard h-full w-full opacity-80" />
      </div>

      {/* Mono footer: system status + staggered activity dots. */}
      <div className="mt-3 flex items-center justify-between font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">
        <span>SYS · Loading</span>
        <span aria-hidden className="flex items-center gap-1">
          {[0, 200, 400].map((delay) => (
            <span
              key={delay}
              className="pulse-dot h-1 w-1 rounded-full bg-ink-400"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </span>
      </div>

      <span className="sr-only">{label}</span>
    </div>
  );
}
