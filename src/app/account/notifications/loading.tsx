import { Skeleton } from "@/components/ui/Skeleton";

// Skeleton mirroring the notifications feed (header band + a column of
// notification cards) while the session-gated first page loads.
export default function LoadingNotifications() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse px-4 py-10 sm:px-6">
      <Skeleton tone="strong" className="h-8 w-48 rounded-lg" />
      <Skeleton className="mt-3 h-4 w-64 rounded" />

      <div className="mt-8 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card p-4">
            <Skeleton tone="strong" className="h-4 w-3/4 rounded" />
            <Skeleton className="mt-2.5 h-3 w-24 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
