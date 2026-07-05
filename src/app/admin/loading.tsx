// Skeleton for the admin area (dashboard, providers, verifications, reports,
// categories) while the session-gated payload loads.
export default function LoadingAdmin() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse px-4 py-10 sm:px-6">
      <div className="h-8 w-40 rounded-lg bg-ink-200" />
      <div className="mt-3 h-4 w-80 rounded bg-ink-100" />

      <div className="mt-8 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-ink-200" />
              <div>
                <div className="h-4 w-40 rounded bg-ink-200" />
                <div className="mt-2 h-3 w-56 rounded bg-ink-100" />
              </div>
            </div>
            <div className="h-8 w-24 rounded-full bg-ink-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
