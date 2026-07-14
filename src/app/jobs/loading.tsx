import { Skeleton } from "@/components/ui/Skeleton";

// Skeleton for the jobs board / my-jobs (and jobs/new) while the session-gated
// payload loads.
export default function LoadingJobs() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse px-4 py-10 sm:px-6">
      <Skeleton tone="strong" className="h-8 w-52 rounded-lg" />
      <Skeleton className="mt-3 h-4 w-72 rounded" />

      <div className="mt-8 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <Skeleton tone="strong" className="h-5 w-48 rounded" />
                <Skeleton className="mt-3 h-3 w-full rounded" />
                <Skeleton className="mt-2 h-3 w-2/3 rounded" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
