// Internal S2S ingestion (trust & safety extraction RFC §5.3) — never
// gateway-routed (the gateway refuses to forward /internal paths; the global
// internal-secret middleware in app.ts guards these like everything else).
//
// DARK LAUNCH: the owning services still write to their local Report /
// AdminAuditLog tables; they switch their lib/auto-report.ts and lib/audit.ts
// helpers to these endpoints in the cutover PR.
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import {
  MODERATION_REASON,
  checkFields,
  moderationDetails,
} from "../lib/moderation";
import { OWNER_BY_TARGET_TYPE, TARGET_TYPES } from "../lib/owners";

export const internal = new Hono();

const autoReportSchema = z.object({
  targetType: z.enum(TARGET_TYPES),
  targetId: z.string().min(1),
  // The user-generated text fields to filter, keyed by field name (e.g.
  // { headline, bio } for a provider profile). Null/undefined values are
  // skipped by checkFields (optional columns).
  fields: z.record(z.string(), z.string().nullish()),
});

// Content-filter ingestion (#375, RFC §4.3): replaces the three per-service
// lib/auto-report.ts copies. Runs the canonical filter (lib/moderation.ts)
// and, on a hit, files a SYSTEM-source report — content stays visible
// (decision on #375: auto-report for admin triage, never hard-block a write).
// Dedupe mirrors the helpers it replaces: at most one OPEN SYSTEM report per
// target, refreshed with the latest match on re-edit. Callers stay
// best-effort: they catch/log failures and never fail the user's write.
internal.post("/internal/reports/auto", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = autoReportSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }
  const { targetType, targetId, fields } = parsed.data;

  const hit = checkFields(fields);
  if (!hit) {
    return c.json({ ok: true, flagged: false });
  }
  const details = moderationDetails(hit, fields[hit.field] ?? "");

  const existing = await db.report.findFirst({
    where: { targetType, targetId, source: "SYSTEM", status: "OPEN" },
  });
  if (existing) {
    await db.report.update({ where: { id: existing.id }, data: { details } });
    return c.json({ ok: true, flagged: true });
  }
  await db.report.create({
    data: {
      targetType,
      targetId,
      ownerService: OWNER_BY_TARGET_TYPE[targetType],
      reporterId: null,
      reason: MODERATION_REASON,
      details,
      source: "SYSTEM",
    },
  });
  return c.json({ ok: true, flagged: true });
});

const auditSchema = z.object({
  adminId: z.string().min(1),
  action: z.string().min(1).max(100),
  targetType: z.string().min(1).max(50),
  targetId: z.string().min(1),
  reason: z.string().max(500).nullish(),
  // Originating service — the owner-native admin surfaces that keep writing
  // audit rows after the cutover (provider verify/suspend, photo
  // delete/restore, review delete/restore, job hide/unhide, category edits).
  service: z.enum(["provider", "review", "job"]),
});

// Audit ingestion (RFC §5.3): owner-native admin actions that stay in place
// log here instead of a local AdminAuditLog. Callers keep their
// fire-and-record, never-fail-the-write semantics (their logAudit swallows
// errors), so this endpoint just validates and inserts.
internal.post("/internal/audit", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = auditSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }
  const { adminId, action, targetType, targetId, service } = parsed.data;
  await db.adminAuditLog.create({
    data: {
      adminId,
      action,
      targetType,
      targetId,
      reason: parsed.data.reason || null,
      service,
    },
  });
  return c.json({ ok: true });
});
