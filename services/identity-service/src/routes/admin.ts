// Admin dashboard analytics (#219): signup counts over time by role, for the
// /admin home page's signups chart. A read-only endpoint, so open to the
// SUPPORT tier as well as full ADMIN (#226); role forwarded by the gateway
// after JWT verification, otherwise 403.
import { Hono } from "hono";
import { db } from "../db";
import { isSupportOrAdmin } from "../lib/http";

export const adminRoutes = new Hono();

const SIGNUP_WINDOW_DAYS = 30;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Daily signup counts for the trailing SIGNUP_WINDOW_DAYS days (UTC-bucketed,
// zero-filled so the chart has no gaps), split into customers vs providers.
// Admin accounts (created via the create-admin script, not self-registration)
// are excluded from both series.
adminRoutes.get("/signups", async (c) => {
  if (!isSupportOrAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (SIGNUP_WINDOW_DAYS - 1));

  const users = await db.user.findMany({
    where: { createdAt: { gte: since }, role: { in: ["CUSTOMER", "PROVIDER"] } },
    select: { createdAt: true, role: true },
  });

  const buckets = new Map<
    string,
    { date: string; customers: number; providers: number }
  >();
  for (let i = 0; i < SIGNUP_WINDOW_DAYS; i++) {
    const d = new Date(since);
    d.setUTCDate(d.getUTCDate() + i);
    const key = dayKey(d);
    buckets.set(key, { date: key, customers: 0, providers: 0 });
  }

  for (const u of users) {
    const bucket = buckets.get(dayKey(u.createdAt));
    if (!bucket) continue;
    if (u.role === "PROVIDER") bucket.providers += 1;
    else bucket.customers += 1;
  }

  const series = Array.from(buckets.values());
  const totals = series.reduce(
    (acc, b) => ({
      customers: acc.customers + b.customers,
      providers: acc.providers + b.providers,
    }),
    { customers: 0, providers: 0 }
  );

  return c.json({ series, totals });
});
