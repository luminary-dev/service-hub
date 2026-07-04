// Route-level skeleton for the browse page: heading, filter bar and the
// provider card grid, mirroring the real layout in page.tsx.
export default function LoadingProviders() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-4 py-10 sm:px-6">
      <div>
        <div className="h-9 w-64 rounded-lg bg-ink-200" />
        <div className="mt-3 h-4 w-48 rounded bg-ink-200" />
      </div>

      <div className="card mt-6 flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
        <div className="h-10 rounded-xl bg-ink-100 sm:flex-1" />
        <div className="h-10 rounded-xl bg-ink-100 sm:w-48" />
        <div className="h-10 rounded-xl bg-ink-100 sm:w-44" />
        <div className="h-10 w-24 rounded-full bg-ink-200" />
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card overflow-hidden">
            <div className="h-36 bg-ink-100" />
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="-mt-9 h-14 w-14 rounded-full border-4 border-white bg-ink-200" />
                <div className="min-w-0 flex-1 pt-1">
                  <div className="h-4 w-32 rounded bg-ink-200" />
                  <div className="mt-2 h-3 w-40 rounded bg-ink-100" />
                </div>
              </div>
              <div className="mt-4 h-3 w-full rounded bg-ink-100" />
              <div className="mt-2 h-3 w-2/3 rounded bg-ink-100" />
              <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3">
                <div className="h-4 w-24 rounded bg-ink-100" />
                <div className="h-4 w-20 rounded bg-ink-100" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
