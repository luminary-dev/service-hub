// Route-level skeleton for the provider profile: header band (avatar, name,
// meta, actions) plus the two-column body, mirroring the real page layout.
export default function LoadingProviderProfile() {
  return (
    <div className="animate-pulse">
      <div className="border-b border-ink-200 bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-5">
              <div className="h-[88px] w-[88px] shrink-0 rounded-full bg-ink-200" />
              <div>
                <div className="flex items-center gap-2">
                  <div className="h-7 w-48 rounded-lg bg-ink-200" />
                  <div className="h-6 w-20 rounded-full bg-ink-100" />
                </div>
                <div className="mt-3 h-4 w-32 rounded bg-ink-100" />
                <div className="mt-2 h-4 w-44 rounded bg-ink-100" />
                <div className="mt-3 h-4 w-36 rounded bg-ink-100" />
              </div>
            </div>
            <div className="flex flex-col items-start gap-3 sm:items-end">
              <div className="h-10 w-28 rounded-full bg-ink-100" />
              <div className="h-10 w-40 rounded-full bg-ink-100" />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-8 lg:col-span-2">
            <section className="card p-6">
              <div className="h-5 w-24 rounded bg-ink-200" />
              <div className="mt-4 h-4 w-3/4 rounded bg-ink-100" />
              <div className="mt-3 h-3 w-full rounded bg-ink-100" />
              <div className="mt-2 h-3 w-full rounded bg-ink-100" />
              <div className="mt-2 h-3 w-2/3 rounded bg-ink-100" />
            </section>

            <section className="card p-6">
              <div className="h-5 w-36 rounded bg-ink-200" />
              <div className="mt-5 space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="h-4 w-40 rounded bg-ink-100" />
                      <div className="mt-2 h-3 w-56 rounded bg-ink-100" />
                    </div>
                    <div className="h-4 w-20 rounded bg-ink-100" />
                  </div>
                ))}
              </div>
            </section>

            <section className="card p-6">
              <div className="h-5 w-28 rounded bg-ink-200" />
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded-xl bg-ink-100" />
                ))}
              </div>
            </section>

            <section className="card p-6">
              <div className="h-5 w-28 rounded bg-ink-200" />
              <div className="mt-5 space-y-5">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-ink-200" />
                      <div>
                        <div className="h-3.5 w-28 rounded bg-ink-100" />
                        <div className="mt-1.5 h-3 w-36 rounded bg-ink-100" />
                      </div>
                    </div>
                    <div className="mt-3 h-3 w-full rounded bg-ink-100" />
                    <div className="mt-2 h-3 w-3/4 rounded bg-ink-100" />
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="lg:col-span-1">
            <div className="card sticky top-24 p-6">
              <div className="h-5 w-44 rounded bg-ink-200" />
              <div className="mt-2 h-3 w-52 rounded bg-ink-100" />
              <div className="mt-5 space-y-4">
                <div className="h-10 rounded-xl bg-ink-100" />
                <div className="h-10 rounded-xl bg-ink-100" />
                <div className="h-24 rounded-xl bg-ink-100" />
                <div className="h-10 rounded-full bg-ink-200" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
