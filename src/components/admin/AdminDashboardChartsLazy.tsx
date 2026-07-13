"use client";

import dynamic from "next/dynamic";
import type { CategoryStat, SignupPoint } from "./AdminDashboardCharts";

// recharts is by far the heaviest web dependency, and it's only used for the
// two below-the-fold charts on the /admin dashboard (#522). Loading it via
// next/dynamic with `ssr: false` keeps it out of the route's first-load JS —
// the bundle is fetched on demand once the page mounts. `ssr: false` isn't
// allowed in Server Components, so the dynamic import lives here in a thin
// client boundary that the (server) dashboard page renders.
const AdminDashboardCharts = dynamic(() => import("./AdminDashboardCharts"), {
  ssr: false,
  loading: () => <ChartsSkeleton />,
});

// Mirrors the real two-card chart grid so the layout doesn't shift when
// recharts arrives; same animate-pulse / ink tokens as the route skeletons.
function ChartsSkeleton() {
  return (
    <div className="grid animate-pulse gap-5 lg:grid-cols-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="card p-5">
          <div className="h-4 w-40 rounded bg-ink-200" />
          <div className="mt-4 h-64 rounded bg-ink-100" />
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboardChartsLazy(props: {
  signups: SignupPoint[];
  categories: CategoryStat[];
}) {
  return <AdminDashboardCharts {...props} />;
}
