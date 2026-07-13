// Shared write-time content filter (#375) — canonical, identical in review-,
// provider- and job-service (same convention as lib/logging.ts; the denylist
// lives in moderation-terms.ts). Pure matching only: on a hit the calling
// route auto-files a SYSTEM-source report into its own moderation queue and
// the content stays visible (decision on #375: auto-report for admin triage,
// never hard-block a write). Database-free so it's unit-testable.
import { LATIN_TERMS, SINHALA_TERMS } from "./moderation-terms";

export type ModerationHit = { term: string; field: string };

// NFKC folds full-width/compatibility lookalikes, zero-width characters are
// stripped so a zero-width space can't split a term invisibly, and whitespace runs
// collapse so multi-word phrases match regardless of spacing.
function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, "")
    .replace(/\s+/g, " ");
}

const escapeRegExp = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// One compiled alternation for the Latin-script list. "Word boundary" here is
// "not adjacent to any letter or digit" — Unicode-aware, so a term glued to
// Sinhala script doesn't slip through either.
const latinPattern = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${LATIN_TERMS.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}])`,
  "iu"
);

// First denylist hit in `text`, or null when clean.
export function checkText(text: string, field = "text"): ModerationHit | null {
  const value = normalize(text);
  const latin = value.match(latinPattern);
  if (latin) {
    return { term: latin[0], field };
  }
  for (const term of SINHALA_TERMS) {
    if (value.includes(term)) {
      return { term, field };
    }
  }
  return null;
}

// Multi-field payloads (e.g. a profile's headline + bio): first hit wins.
// Null/undefined fields (optional columns) are skipped.
export function checkFields(
  fields: Record<string, string | null | undefined>
): ModerationHit | null {
  for (const [field, text] of Object.entries(fields)) {
    if (!text) continue;
    const hit = checkText(text, field);
    if (hit) return hit;
  }
  return null;
}

// Report `details` line for an auto-filed hit: names the matched term and
// carries a short excerpt of the offending field so the queue row is
// self-explanatory even where the target hydration can't pinpoint the exact
// text (e.g. one message inside a thread). Bounded well under the 500-char
// details cap user reports are held to.
const EXCERPT_LENGTH = 160;

export function moderationDetails(hit: ModerationHit, text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  const excerpt =
    trimmed.length > EXCERPT_LENGTH ? `${trimmed.slice(0, EXCERPT_LENGTH)}…` : trimmed;
  return `content filter matched "${hit.term}" in ${hit.field}: "${excerpt}"`;
}

// Reason string for auto-filed reports — same "auto-flag:" convention as
// provider-service's threshold flagging (#232) so admins can spot
// SYSTEM-created rows at a glance.
export const MODERATION_REASON = "auto-flag: content filter";
