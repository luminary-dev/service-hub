// Admin job-management endpoints (#222). All require x-user-role=ADMIN
// (forwarded by the gateway after JWT verification), otherwise 403
// { error: "Forbidden" } — mirrors provider-service's routes/admin.ts.
import { Hono } from "hono";
import type { Context } from "hono";
import { db } from "../db";
import { getAuth } from "../lib/http";
import { fetchUsers, fetchProviders } from "../lib/hydrate";

export const admin = new Hono();

function isAdmin(c: Context): boolean {
  return getAuth(c)?.role === "ADMIN";
}

// Job list (#222): newest first, optionally filtered by status/category, with
// the customer name and a response count hydrated for the row.
admin.get("/api/admin/jobs", async (c) => {
  if (!isAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const status = c.req.query("status");
  const category = c.req.query("category");

  const rows = await db.jobRequest.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { responses: true } } },
  });

  const customerIds = [...new Set(rows.map((j) => j.customerId))];
  const users = await fetchUsers(customerIds);

  const jobs = rows.map(({ _count, ...job }) => ({
    ...job,
    customer: { name: users.get(job.customerId)?.name ?? "Unknown" },
    responseCount: _count.responses,
  }));

  return c.json({ jobs });
});

// Job detail (#222): job + its responses, with customer and provider contact
// info hydrated from identity-service / provider-service (degrades to
// "Unknown" / null on any upstream failure — never fails the admin view).
admin.get("/api/admin/jobs/:id", async (c) => {
  if (!isAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const id = c.req.param("id");
  const job = await db.jobRequest.findUnique({
    where: { id },
    include: { responses: { orderBy: { createdAt: "desc" } } },
  });
  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  const providerIds = [...new Set(job.responses.map((r) => r.providerId))];
  const [users, providers] = await Promise.all([
    fetchUsers([job.customerId]),
    fetchProviders(providerIds),
  ]);

  return c.json({
    job: {
      id: job.id,
      title: job.title,
      description: job.description,
      category: job.category,
      district: job.district,
      budget: job.budget,
      status: job.status,
      createdAt: job.createdAt,
      customer: {
        id: job.customerId,
        name: users.get(job.customerId)?.name ?? "Unknown",
        email: users.get(job.customerId)?.email ?? null,
      },
      responses: job.responses.map((r) => ({
        id: r.id,
        message: r.message,
        createdAt: r.createdAt,
        provider: {
          id: r.providerId,
          name: providers.get(r.providerId)?.contactName ?? "Unknown",
          phone: providers.get(r.providerId)?.contactPhone ?? null,
        },
      })),
    },
  });
});
