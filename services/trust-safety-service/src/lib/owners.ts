// Target-type → owning-service mapping (trust & safety extraction RFC §3/§5).
// trust-safety owns the Report rows; the CONTENT rows stay with their owning
// services, which expose internal moderation endpoints this service calls over
// s2s(): target validation/hydration reads and the takedown/restore mutations.
// Database-free so it's unit-testable.

export const TARGET_TYPES = [
  "PROVIDER",
  "WORK_PHOTO",
  "INQUIRY",
  "MESSAGE",
  "REVIEW",
  "JOB",
  "JOB_RESPONSE",
] as const;

export type TargetType = (typeof TARGET_TYPES)[number];

export type OwnerService = "provider" | "review" | "job";

export const OWNER_BY_TARGET_TYPE: Record<TargetType, OwnerService> = {
  PROVIDER: "provider",
  WORK_PHOTO: "provider",
  INQUIRY: "provider",
  MESSAGE: "provider",
  REVIEW: "review",
  JOB: "job",
  JOB_RESPONSE: "job",
};

// Peer base URLs from env (compose sets the *_SERVICE_URL trio; the localhost
// fallbacks match the host-mode dev ports).
export function ownerServiceUrl(owner: OwnerService): string {
  switch (owner) {
    case "provider":
      return process.env.PROVIDER_SERVICE_URL ?? "http://localhost:4002";
    case "review":
      return process.env.REVIEW_SERVICE_URL ?? "http://localhost:4003";
    case "job":
      return process.env.JOB_SERVICE_URL ?? "http://localhost:4004";
  }
}

// URL path segment for the owner's takedown/restore mutation
// (POST /internal/moderation/<segment>/:id/takedown|restore, RFC §3 Option A).
// INQUIRY (a content-filter flag on a whole thread) and JOB_RESPONSE have no
// takedown mutation today, so they are deliberately absent — the action route
// rejects them with 400.
export const ACTION_SEGMENT_BY_TARGET_TYPE: Partial<Record<TargetType, string>> = {
  PROVIDER: "providers",
  WORK_PHOTO: "photos",
  MESSAGE: "messages",
  REVIEW: "reviews",
  JOB: "jobs",
};
