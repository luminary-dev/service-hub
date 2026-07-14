import { Skeleton } from "@/components/ui/Skeleton";

// Skeleton for the dashboard message thread (#381): mirrors the page shell
// (back link, MSG tag + heading, thread panel) so navigating into a
// conversation doesn't flash the dashboard list skeleton.
export default function LoadingDashboardInquiryThread() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse px-4 py-10 sm:px-6">
      <Skeleton className="h-4 w-28 rounded" />
      <div className="mt-3 flex items-center gap-2.5">
        <Skeleton tone="strong" className="h-5 w-10 rounded-sm" />
        <Skeleton tone="strong" className="h-7 w-40 rounded-lg" />
      </div>
      <div className="tech-corners mt-6 rounded-lg border border-ink-300 bg-surface p-6">
        <Skeleton className="h-4 w-1/3 rounded" />
        <Skeleton className="mt-4 h-16 rounded" />
      </div>
    </div>
  );
}
