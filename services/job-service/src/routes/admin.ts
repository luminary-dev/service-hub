// Admin job-management endpoints (#222). Reads (jobs list + detail) are open
// to the SUPPORT tier (isSupportOrAdmin); the takedown write (#376) requires
// full ADMIN (isFullAdmin). Roles are forwarded by the gateway after JWT
// verification, otherwise 403 { error: "Forbidden" }.
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { logAudit } from "../lib/audit";
import { isFullAdmin, isSupportOrAdmin } from "../lib/http";
import { fetchUsers, fetchProviders } from "../lib/hydrate";
import { moneyToNumberOrNull } from "../lib/money";
import { normalizeListQuery } from "../lib/query";

export const admin = new Hono();

// Allowed JobRequest.status values (schema: OPEN | CLOSED). The status column
// is a plain String, so an unrecognized filter value doesn't inject but Prisma
// still rejects it and 500s — so, like provider-service's admin list
// normalizer, an out-of-range status is simply dropped (no filter) rather than
// erroring. `category` is a free-form String column: any value is a legal
// filter (it just matches nothing), so it needs no allow-list.
const JOB_STATUSES = ["OPEN", "CLOSED"] as const;

// Job list (#222): newest first, optionally filtered by status/category, with
// the customer name and a response count hydrated for the row. Paginated
// (#372) like every other admin list: page/pageSize use the shared board
// normalization (default 20, cap 50) and `total` rides along; the envelope
// keeps the existing `jobs` key so older callers keep working.
admin.get("/api/admin/jobs", async (c) => {
  if (!isSupportOrAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const statusParam = c.req.query("status");
  const status = JOB_STATUSES.includes(statusParam as (typeof JOB_STATUSES)[number])
    ? statusParam
    : undefined;
  const category = c.req.query("category");

  const { page, pageSize } = normalizeListQuery({
    page: c.req.query("page") ?? null,
    pageSize: c.req.query("pageSize") ?? null,
  });

  const where = {
    ...(status ? { status } : {}),
    ...(category ? { category } : {}),
  };
  const [total, rows] = await Promise.all([
    db.jobRequest.count({ where }),
    db.jobRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { responses: true } } },
    }),
  ]);

  const customerIds = [...new Set(rows.map((j) => j.customerId))];
  const users = await fetchUsers(customerIds);

  const jobs = rows.map(({ _count, ...job }) => ({
    ...job,
    // budget is DECIMAL in the DB (#371) — a Decimal JSON-serializes as a
    // string, so convert back to the number this payload has always carried.
    budget: moneyToNumberOrNull(job.budget),
    customer: { name: users.get(job.customerId)?.name ?? "Unknown" },
    responseCount: _count.responses,
  }));

  return c.json({ jobs, total, page, pageSize });
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
      // Same Decimal → number edge conversion as the list above (#371).
      budget: moneyToNumberOrNull(job.budget),
      status: job.status,
      hiddenAt: job.hiddenAt,
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

const takedownSchema = z.object({ action: z.enum(["hide", "unhide"]) });

// Admin takedown (#376): hide a reported job (soft, reversible — mirrors the
// work-photo soft delete at provider-service). Hidden jobs vanish from the
// provider board and stop accepting responses; the row survives so unhide
// can restore it. Destructive → full ADMIN only, audit-logged.
admin.patch("/api/admin/jobs/:id", async (c) => {
  if (!isFullAdmin(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const id = c.req.param("id");
  const job = await db.jobRequest.findUnique({ where: { id } });
  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = takedownSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid action" }, 400);
  }

  const hide = parsed.data.action === "hide";
  await db.jobRequest.update({
    where: { id },
    data: { hiddenAt: hide ? new Date() : null },
  });
  await logAudit(c, hide ? "hide-job" : "unhide-job", "JOB", id);
  return c.json({ ok: true });
});
