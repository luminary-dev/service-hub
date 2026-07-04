// Away mode (#49): a provider going on leave sets Provider.awayUntil; the
// `available` toggle itself is untouched. Effective availability — what public
// listings filter on and what card/profile badges display — is derived here so
// availability flips back automatically once the return date passes (no cron,
// no write-back needed).

export type AvailabilityFields = {
  available: boolean;
  awayUntil: Date | null;
};

// True while awayUntil is set and still in the future. An awayUntil in the
// past is inert — the provider is "back" the moment the date passes.
export function isAway(p: Pick<AvailabilityFields, "awayUntil">, now: Date = new Date()): boolean {
  return p.awayUntil !== null && p.awayUntil > now;
}

// The single definition of "available right now":
// available && (awayUntil == null || awayUntil <= now).
export function isEffectivelyAvailable(p: AvailabilityFields, now: Date = new Date()): boolean {
  return p.available && !isAway(p, now);
}
