import { Skeleton } from "@/components/ui/Skeleton";

// Route-level skeleton for the provider profile: header band (avatar, name,
// meta, actions) plus the two-column body, mirroring the real page layout.
export default function LoadingProviderProfile() {
  return (
    <div className="animate-pulse">
      <div className="border-b border-ink-200 bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-5">
              <Skeleton
                tone="strong"
                className="h-[88px] w-[88px] shrink-0 rounded-full"
              />
              <div>
                <div className="flex items-center gap-2">
                  <Skeleton tone="strong" className="h-7 w-48 rounded-lg" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <Skeleton className="mt-3 h-4 w-32 rounded" />
                <Skeleton className="mt-2 h-4 w-44 rounded" />
                <Skeleton className="mt-3 h-4 w-36 rounded" />
              </div>
            </div>
            <div className="flex flex-col items-start gap-3 sm:items-end">
              <Skeleton className="h-10 w-28 rounded-full" />
              <Skeleton className="h-10 w-40 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-8 lg:col-span-2">
            <section className="card p-6">
              <Skeleton tone="strong" className="h-5 w-24 rounded" />
              <Skeleton className="mt-4 h-4 w-3/4 rounded" />
              <Skeleton className="mt-3 h-3 w-full rounded" />
              <Skeleton className="mt-2 h-3 w-full rounded" />
              <Skeleton className="mt-2 h-3 w-2/3 rounded" />
            </section>

            <section className="card p-6">
              <Skeleton tone="strong" className="h-5 w-36 rounded" />
              <div className="mt-5 space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <Skeleton className="h-4 w-40 rounded" />
                      <Skeleton className="mt-2 h-3 w-56 rounded" />
                    </div>
                    <Skeleton className="h-4 w-20 rounded" />
                  </div>
                ))}
              </div>
            </section>

            <section className="card p-6">
              <Skeleton tone="strong" className="h-5 w-28 rounded" />
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-xl" />
                ))}
              </div>
            </section>

            <section className="card p-6">
              <Skeleton tone="strong" className="h-5 w-28 rounded" />
              <div className="mt-5 space-y-5">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-3">
                      <Skeleton tone="strong" className="h-9 w-9 rounded-full" />
                      <div>
                        <Skeleton className="h-3.5 w-28 rounded" />
                        <Skeleton className="mt-1.5 h-3 w-36 rounded" />
                      </div>
                    </div>
                    <Skeleton className="mt-3 h-3 w-full rounded" />
                    <Skeleton className="mt-2 h-3 w-3/4 rounded" />
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="lg:col-span-1">
            <div className="card sticky top-24 p-6">
              <Skeleton tone="strong" className="h-5 w-44 rounded" />
              <Skeleton className="mt-2 h-3 w-52 rounded" />
              <div className="mt-5 space-y-4">
                <Skeleton className="h-10 rounded-xl" />
                <Skeleton className="h-10 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton tone="strong" className="h-10 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
