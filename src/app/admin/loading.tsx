import { Skeleton, SkeletonList } from "@/components/ui/Skeleton";

// Skeleton for the admin area (dashboard, providers, verifications, reports,
// categories) while the session-gated payload loads.
export default function LoadingAdmin() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse px-4 py-10 sm:px-6">
      <Skeleton tone="strong" className="h-8 w-40 rounded-lg" />
      <Skeleton className="mt-3 h-4 w-80 rounded" />

      <SkeletonList rows={6} className="mt-8" />
    </div>
  );
}
