// Admin billing endpoints (#221 v1: flat 10% commission default — a starting
// point to unblock admin visibility, not a finalized pricing decision). All
// require x-user-role=ADMIN (forwarded by the gateway after JWT
// verification), otherwise 403 { error: "Forbidden" }.
import { Hono } from "hono";
import { z } from "zod";
import type { Context } from "hono";
import type { Transaction } from "@prisma/client";
import { db } from "../db";
import { getAuth, s2s } from "../lib/http";
import { log } from "../lib/log";

export const adminRoutes = new Hono();

const PROVIDER_URL = process.env.PROVIDER_SERVICE_URL ?? "http://localhost:4002";

function isAdmin(c: Context): boolean {
  return getAuth(c)?.role === "ADMIN";
}

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
  if (!isAdmin(c)) {
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
  if (!isAdmin(c)) {
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
