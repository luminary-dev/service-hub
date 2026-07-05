// Skeleton for the provider dashboard (and its nested inquiry pages) while the
// session-gated, multi-service payload loads — avoids freezing on the previous
// page during navigation.
export default function LoadingDashboard() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-4 py-10 sm:px-6">
      <div className="h-8 w-56 rounded-lg bg-ink-200" />
      <div className="mt-3 h-4 w-72 rounded bg-ink-100" />

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-5">
            <div className="h-4 w-24 rounded bg-ink-100" />
            <div className="mt-3 h-7 w-16 rounded bg-ink-200" />
          </div>
        ))}
      </div>

      <div className="mt-8 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card flex items-center gap-4 p-4">
            <div className="h-10 w-10 rounded-full bg-ink-200" />
            <div className="flex-1">
              <div className="h-4 w-40 rounded bg-ink-200" />
              <div className="mt-2 h-3 w-64 rounded bg-ink-100" />
            </div>
            <div className="h-8 w-20 rounded-full bg-ink-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
