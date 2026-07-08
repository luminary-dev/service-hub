// Admin billing endpoints (#221 v1: flat 10% commission default — a starting
// point to unblock admin visibility, not a finalized pricing decision) and
// admin job-management endpoints (#222). Reads (transactions/jobs lists +
// detail) are open to the SUPPORT tier; the destructive transaction status
// write requires full ADMIN (#226). Roles are forwarded by the gateway after
// JWT verification, otherwise 403 { error: "Forbidden" }.
import { Hono } from "hono";
import { z } from "zod";
import type { Transaction } from "@prisma/client";
import { db } from "../db";
import { isFullAdmin, isSupportOrAdmin, s2s } from "../lib/http";
import { fetchUsers, fetchProviders } from "../lib/hydrate";
import { log } from "../lib/log";

export const adminRoutes = new Hono();

const PROVIDER_URL = process.env.PROVIDER_SERVICE_URL ?? "http://localhost:4002";

const TRANSACTION_STATUSES = ["PENDING", "PAID", "REFUNDED"] as const;

// Decimal fields serialize as strings by default (decimal.js) — flatten to
// plain numbers so the frontend can treat them like every other money field
// in this app (JobRequest.budget, Service.price).
function serializeTransaction(t: Transaction) {
  return {
    id: t.id,
    jobRequestId: t.jobRequestId,
    providerId: t.providerId,
    amount: Number(t.amount),
    commissionRate: Number(t.commissionRate),
    commissionAmount: Number(t.commissionAmount),
    status: t.status,
    createdAt: t.createdAt,
  };
}

// Provider contact-name hydration from provider-service, mirroring
// fetchProviders() in routes/jobs.ts. Degrades gracefully to an empty map.
async function fetchProviderNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  try {
    const res = await s2s(PROVIDER_URL, `/internal/providers?ids=${ids.join(",")}`);
    if (!res.ok) return map;
    const data = (await res.json()) as {
      providers: { id: string; contactName: string | null }[];
    };
    for (const p of data.providers) {
      if (p.contactName) map.set(p.id, p.contactName);
    }
  } catch (e) {
    log.error("provider hydration failed", { context: "admin-transactions", err: e });
  }
  return map;
}

const listQuerySchema = z.object({
  status: z.enum(TRANSACTION_STATUSES).optional(),
});

// GET /api/admin/transactions?status=PENDING|PAID|REFUNDED — newest first,
// optionally filtered by status. Job title (local table) and provider name
// (S2S, best-effort) are hydrated for display.
adminRoutes.get("/api/admin/transactions", async (c) => {
  if (!isSupportOrAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const parsed = listQuerySchema.safeParse({ status: c.req.query("status") });
  if (!parsed.success) {
    return c.json({ error: "Invalid status filter" }, 400);
  }

  const rows = await db.transaction.findMany({
    where: parsed.data.status ? { status: parsed.data.status } : undefined,
    orderBy: { createdAt: "desc" },
  });

  const jobRequestIds = [...new Set(rows.map((t) => t.jobRequestId))];
  const providerIds = [...new Set(rows.map((t) => t.providerId))];
  const [jobs, providerNames] = await Promise.all([
    jobRequestIds.length
      ? db.jobRequest.findMany({
          where: { id: { in: jobRequestIds } },
          select: { id: true, title: true },
        })
      : Promise.resolve([]),
    fetchProviderNames(providerIds),
  ]);
  const jobTitleById = new Map(jobs.map((j) => [j.id, j.title]));

  const transactions = rows.map((t) => ({
    ...serializeTransaction(t),
    jobTitle: jobTitleById.get(t.jobRequestId) ?? null,
    providerName: providerNames.get(t.providerId) ?? null,
  }));

  return c.json({ transactions });
});

const updateSchema = z.object({ status: z.enum(["PAID", "REFUNDED"]) });

// PATCH /api/admin/transactions/:id — mark a transaction paid or refunded.
adminRoutes.patch("/api/admin/transactions/:id", async (c) => {
  if (!isFullAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid status" }, 400);
  }

  const { count } = await db.transaction.updateMany({
    where: { id: c.req.param("id") },
    data: { status: parsed.data.status },
  });
  if (count === 0) {
    return c.json({ error: "Transaction not found" }, 404);
  }
  return c.json({ ok: true });
});

export const admin = new Hono();

// Job list (#222): newest first, optionally filtered by status/category, with
// the customer name and a response count hydrated for the row.
admin.get("/api/admin/jobs", async (c) => {
  if (!isSupportOrAdmin(c)) {
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
  if (!isSupportOrAdmin(c)) {
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
