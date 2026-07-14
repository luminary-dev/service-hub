import { Skeleton } from "@/components/ui/Skeleton";

// Skeleton for the account message thread (#381): mirrors the page shell
// (PageHeader band, thread panel) so navigating into a conversation doesn't
// flash the account overview skeleton.
export default function LoadingAccountInquiryThread() {
  return (
    <div className="animate-pulse">
      <section className="blueprint-grid border-b border-ink-300 bg-ink-50">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Skeleton tone="strong" className="h-5 w-10 rounded-sm" />
            <Skeleton className="h-4 w-28 rounded" />
          </div>
          <Skeleton tone="strong" className="mt-3 h-10 w-56 rounded-lg" />
        </div>
      </section>
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="tech-corners rounded-lg border border-ink-300 bg-surface p-6">
          <Skeleton className="h-4 w-1/3 rounded" />
          <Skeleton className="mt-4 h-16 rounded" />
        </div>
      </div>
    </div>
  );
}
