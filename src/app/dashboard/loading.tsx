import { Skeleton, SkeletonList } from "@/components/ui/Skeleton";

// Skeleton for the provider dashboard (and its nested inquiry pages) while the
// session-gated, multi-service payload loads — avoids freezing on the previous
// page during navigation.
export default function LoadingDashboard() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-4 py-10 sm:px-6">
      <Skeleton tone="strong" className="h-8 w-56 rounded-lg" />
      <Skeleton className="mt-3 h-4 w-72 rounded" />

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-5">
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton tone="strong" className="mt-3 h-7 w-16 rounded" />
          </div>
        ))}
      </div>

      <SkeletonList rows={4} className="mt-8" />
    </div>
  );
}
