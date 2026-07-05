// Skeleton for the account area (saved providers, inquiries, security) while
// the session-gated payload loads.
export default function LoadingAccount() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse px-4 py-10 sm:px-6">
      <div className="h-8 w-48 rounded-lg bg-ink-200" />
      <div className="mt-3 h-4 w-64 rounded bg-ink-100" />

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card p-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-ink-200" />
              <div className="flex-1">
                <div className="h-4 w-28 rounded bg-ink-200" />
                <div className="mt-2 h-3 w-36 rounded bg-ink-100" />
              </div>
            </div>
            <div className="mt-4 h-3 w-full rounded bg-ink-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
