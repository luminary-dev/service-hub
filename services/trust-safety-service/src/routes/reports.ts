// Public abuse reporting (#50/#376) for every reportable target type —
// unified here by the trust & safety extraction (RFC §5.1). Paths and payload
// contracts are byte-identical to the three per-service routes they replace,
// so the gateway's shared "report" rate-limit budget and every web caller
// stay untouched at cutover. Session is OPTIONAL on the public targets —
// anonymous visitors can report too. Thread messages are private, so their
// report route additionally requires the caller to be a thread party.
//
// DARK LAUNCH: the gateway does not route these paths here yet (they still
// resolve to provider/review/job); nothing reaches this file in production
// until the cutover PR flips the routing.
//
// This service holds no content rows, so target existence/visibility is
// checked against the owning service over s2s():
//   GET /internal/moderation/targets/:type/:id → { exists, visible, parties? }
// A hidden/soft-deleted target 404s exactly as it does today; owner outage on
// this validation read → 503 (write-path gates fail loudly). NOTE: the owners
// grow that endpoint in the cutover PR — until then the check itself fails
// and this route answers 503 (tests stub s2s).
import { Prisma } from "@prisma/client";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { db } from "../db";
import { getAuth, s2s } from "../lib/http";
import { log } from "../lib/log";
import {
  OWNER_BY_TARGET_TYPE,
  ownerServiceUrl,
  type TargetType,
} from "../lib/owners";

export const reports = new Hono();

export const REPORT_REASONS = ["spam", "scam", "offensive", "fake", "other"] as const;

const reportSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(500).optional().or(z.literal("")),
});

// Owner-confirmed target state. `parties` only accompanies MESSAGE targets:
// the two thread-party user ids, for the private-thread gate below.
type TargetCheck = {
  exists: boolean;
  visible: boolean;
  parties?: { customerUserId: string | null; providerUserId: string | null };
};

// Validation read against the owning service. Returns null when the owner is
// unreachable or answers malformed — the caller turns that into a 503.
async function checkTarget(
  targetType: TargetType,
  targetId: string
): Promise<TargetCheck | null> {
  const owner = OWNER_BY_TARGET_TYPE[targetType];
  try {
    const res = await s2s(
      ownerServiceUrl(owner),
      `/internal/moderation/targets/${targetType}/${encodeURIComponent(targetId)}`
    );
    if (!res.ok) return null;
    const body = (await res.json()) as TargetCheck;
    if (typeof body?.exists !== "boolean" || typeof body?.visible !== "boolean") {
      return null;
    }
    return body;
  } catch (e) {
    log.error("target validation failed", { targetType, targetId, err: e });
    return null;
  }
}

// Shared create path — identical semantics to the routes it replaces.
// Duplicate protection: a signed-in user re-reporting the same target just
// refreshes their existing OPEN report's reason/details — one queue entry per
// (user, target). Anonymous reports have no identity to key on, so duplicates
// are allowed (the gateway rate limiter is the backstop).
async function fileReport(c: Context, targetType: TargetType, targetId: string) {
  const body = await c.req.json().catch(() => null);
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }
  const { reason } = parsed.data;
  const details = parsed.data.details || null;

  const auth = getAuth(c);
  if (auth) {
    const existing = await db.report.findFirst({
      where: { targetType, targetId, reporterId: auth.userId, status: "OPEN" },
    });
    if (existing) {
      await db.report.update({
        where: { id: existing.id },
        data: { reason, details },
      });
      return c.json({ ok: true });
    }
  }

  try {
    await db.report.create({
      data: {
        targetType,
        targetId,
        ownerService: OWNER_BY_TARGET_TYPE[targetType],
        reporterId: auth?.userId ?? null,
        reason,
        details,
      },
    });
  } catch (e) {
    // Lost the race with a concurrent report from the same user for the same
    // target: the partial unique index `Report_open_reporter_key` (#651) fired.
    // The other request already filed the OPEN report, so this is idempotent
    // success, not a 500.
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) {
      throw e;
    }
  }
  return c.json({ ok: true });
}

// Public-target route factory: validate against the owner (404 wording per
// target type matches today's routes), then file. The owner's `visible` flag
// encodes exactly today's per-type checks — soft-deleted reviews/photos and
// hidden jobs 404 (invisible content can't be reported), while a PROVIDER
// target only needs the row to exist (matching today's provider route, which
// doesn't filter on suspension).
function publicReportRoute(
  path: string,
  targetType: TargetType,
  notFound: string
) {
  reports.post(path, async (c) => {
    // The generic `path` type loses Hono's param inference; every registered
    // path carries :id, so the fallback is unreachable.
    const id = c.req.param("id") ?? "";
    const target = await checkTarget(targetType, id);
    if (!target) {
      return c.json({ error: "Service unavailable" }, 503);
    }
    if (!target.exists || !target.visible) {
      return c.json({ error: notFound }, 404);
    }
    return fileReport(c, targetType, id);
  });
}

publicReportRoute("/api/providers/:id/report", "PROVIDER", "Provider not found");
publicReportRoute("/api/photos/:id/report", "WORK_PHOTO", "Photo not found");
publicReportRoute("/api/reviews/:id/report", "REVIEW", "Review not found");
publicReportRoute("/api/jobs/:id/report", "JOB", "Job not found");

// Inquiry thread messages (#376). Unlike the public targets above, a thread
// is private to its two parties, so only they may report a message — anyone
// else (including signed-out callers) gets the same 404 as a message that
// never existed, to avoid confirming message ids. Messages already removed by
// moderation are invisible in the thread (visible=false) and can't be
// re-reported.
reports.post("/api/messages/:id/report", async (c) => {
  const id = c.req.param("id");
  const target = await checkTarget("MESSAGE", id);
  if (!target) {
    return c.json({ error: "Service unavailable" }, 503);
  }
  const auth = getAuth(c);
  const isParty =
    auth !== null &&
    (auth.userId === target.parties?.customerUserId ||
      auth.userId === target.parties?.providerUserId);
  if (!target.exists || !target.visible || !isParty) {
    return c.json({ error: "Message not found" }, 404);
  }
  return fileReport(c, "MESSAGE", id);
});
