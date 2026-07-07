// Chip styling for the admin provider quality score (#229). The score itself
// is computed server-side in provider-service (see
// services/provider-service/src/lib/quality-score.ts); this just maps the
// 0-100 number to a color cue using the existing chip color conventions
// (emerald/amber/red) already used across the admin UI.
export function qualityChipClasses(score: number): string {
  if (score >= 80) return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  if (score >= 50) return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  return "bg-red-50 text-red-700 ring-1 ring-red-200";
}
