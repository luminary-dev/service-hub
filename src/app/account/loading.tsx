import { Skeleton } from "@/components/ui/Skeleton";

// Skeleton for the account area (saved providers, inquiries, security) while
// the session-gated payload loads.
export default function LoadingAccount() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse px-4 py-10 sm:px-6">
      <Skeleton tone="strong" className="h-8 w-48 rounded-lg" />
      <Skeleton className="mt-3 h-4 w-64 rounded" />

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card p-4">
            <div className="flex items-center gap-3">
              <Skeleton tone="strong" className="h-12 w-12 rounded-full" />
              <div className="flex-1">
                <Skeleton tone="strong" className="h-4 w-28 rounded" />
                <Skeleton className="mt-2 h-3 w-36 rounded" />
              </div>
            </div>
            <Skeleton className="mt-4 h-3 w-full rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
