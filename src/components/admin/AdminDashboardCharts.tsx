"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate } from "@/lib/format";
import { useLocale, useT } from "../I18nProvider";

export type SignupPoint = {
  date: string;
  customers: number;
  providers: number;
};

export type CategoryStat = {
  slug: string;
  labelEn: string;
  labelSi: string;
  count: number;
};

// Charts for the /admin dashboard home page (#219): signups over time
// (customers vs providers) and a top-categories breakdown of providers.
// Colors are CSS variables from globals.css's theme layer so the SVGs
// repaint automatically with the light/dark toggle, same as the rest of the
// UI (no separate dark: chart palette to maintain).
export default function AdminDashboardCharts({
  signups,
  categories,
}: {
  signups: SignupPoint[];
  categories: CategoryStat[];
}) {
  const locale = useLocale();
  const t = useT().admin;

  const signupData = signups.map((p) => ({
    ...p,
    label: formatDate(p.date, locale, { day: "numeric", month: "short" }),
  }));
  const hasSignups = signupData.some((d) => d.customers > 0 || d.providers > 0);

  // Backend already sorts by count desc; keep the chart readable by only
  // showing the top slice — the numbers still roll up correctly in the
  // "Active providers" stat tile above.
  const categoryData = categories
    .slice(0, 8)
    .map((c) => ({ label: locale === "si" ? c.labelSi : c.labelEn, count: c.count }));

  const axisColor = "var(--color-ink-500)";
  const gridColor = "var(--color-ink-200)";
  const tooltipStyle = {
    background: "var(--color-surface)",
    border: "1px solid var(--color-ink-200)",
    borderRadius: 8,
    fontSize: 12,
  };
  const tooltipLabelStyle = { color: "var(--color-ink-900)" };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-ink-900">
          {t.chartSignupsTitle}
        </h2>
        {!hasSignups ? (
          <p className="mt-8 text-sm text-ink-500">{t.chartNoData}</p>
        ) : (
          <>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={signupData}
                  margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: axisColor }}
                    tickLine={false}
                    axisLine={{ stroke: gridColor }}
                    minTickGap={24}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: axisColor }}
                    tickLine={false}
                    axisLine={false}
                    width={32}
                  />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} />
                  <Line
                    type="monotone"
                    dataKey="customers"
                    name={t.legendCustomers}
                    stroke="var(--color-brand-700)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="providers"
                    name={t.legendProviders}
                    stroke="var(--color-ink-500)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex gap-4 text-xs text-ink-600">
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: "var(--color-brand-700)" }}
                />
                {t.legendCustomers}
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: "var(--color-ink-500)" }}
                />
                {t.legendProviders}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold text-ink-900">
          {t.chartCategoryTitle}
        </h2>
        {categoryData.length === 0 ? (
          <p className="mt-8 text-sm text-ink-500">{t.chartNoData}</p>
        ) : (
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={categoryData}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: axisColor }}
                  tickLine={false}
                  axisLine={{ stroke: gridColor }}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={110}
                  tick={{ fontSize: 11, fill: axisColor }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={tooltipLabelStyle}
                  cursor={{ fill: "var(--color-ink-100)" }}
                />
                <Bar dataKey="count" fill="var(--color-brand-600)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
