// Auto-filed moderation reports (#375): when the shared content filter
// (lib/moderation.ts) hits on user-generated text, file a SYSTEM-source
// report on the target so it surfaces in the existing admin queue — the
// content stays visible (decision on #375: auto-report for triage, never
// hard-block a write). Targets here: PROVIDER for profile/service text (same
// target the threshold flagging #232 uses) and INQUIRY for inquiry + thread
// messages. Dedupe: at most one OPEN SYSTEM report per target, refreshed with
// the latest match on re-edit. Best-effort — a moderation failure must never
// fail the user's write. review-service and job-service keep the same-shaped
// helper for the content they own; only the target-type union differs.
import { db } from "../db";
import { log } from "./log";
import { MODERATION_REASON, checkFields, moderationDetails } from "./moderation";

export async function moderateContent(
  targetType: "PROVIDER" | "INQUIRY",
  targetId: string,
  fields: Record<string, string | null | undefined>
): Promise<void> {
  const hit = checkFields(fields);
  if (!hit) return;
  const details = moderationDetails(hit, fields[hit.field] ?? "");
  try {
    const existing = await db.report.findFirst({
      where: { targetType, targetId, source: "SYSTEM", status: "OPEN" },
    });
    if (existing) {
      await db.report.update({ where: { id: existing.id }, data: { details } });
      return;
    }
    await db.report.create({
      data: {
        targetType,
        targetId,
        reporterId: null,
        reason: MODERATION_REASON,
        details,
        source: "SYSTEM",
      },
    });
  } catch (e) {
    log.error("auto-report failed", { context: "moderation", err: e });
  }
}
