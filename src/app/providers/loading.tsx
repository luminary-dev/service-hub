import { Skeleton } from "@/components/ui/Skeleton";

// Route-level skeleton for the browse page: heading, filter bar and the
// provider card grid, mirroring the real layout in page.tsx.
export default function LoadingProviders() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-4 py-10 sm:px-6">
      <div>
        <Skeleton tone="strong" className="h-9 w-64 rounded-lg" />
        <Skeleton tone="strong" className="mt-3 h-4 w-48 rounded" />
      </div>

      <div className="card mt-6 flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
        <Skeleton className="h-10 rounded-xl sm:flex-1" />
        <Skeleton className="h-10 rounded-xl sm:w-48" />
        <Skeleton className="h-10 rounded-xl sm:w-44" />
        <Skeleton tone="strong" className="h-10 w-24 rounded-full" />
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card overflow-hidden">
            <Skeleton className="h-36" />
            <div className="p-4">
              <div className="flex items-start gap-3">
                <Skeleton
                  tone="strong"
                  className="-mt-9 h-14 w-14 rounded-full border-4 border-surface"
                />
                <div className="min-w-0 flex-1 pt-1">
                  <Skeleton tone="strong" className="h-4 w-32 rounded" />
                  <Skeleton className="mt-2 h-3 w-40 rounded" />
                </div>
              </div>
              <Skeleton className="mt-4 h-3 w-full rounded" />
              <Skeleton className="mt-2 h-3 w-2/3 rounded" />
              <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-4 w-20 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
