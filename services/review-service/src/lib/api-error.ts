// Machine-readable error codes for this service's public error responses (#761,
// refs #566/#508). The web app renders backend `error` strings verbatim, which
// surfaces English sentences inside the otherwise fully-Sinhala /si UI. Pairing
// every error with a stable `code` lets the client map it to a localized dict
// entry and fall back to a generic localized string when the code is unknown —
// instead of echoing the raw English `error`.
//
// The `error` string stays in the payload unchanged (existing clients and logs
// keep reading it); `code` is purely additive. Codes are stable identifiers —
// rename with care, clients key off them.
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

// The stable code catalog for review-service. Grouped loosely by concern; the
// same code may back several messages (e.g. every "Upstream service
// unavailable" is UPSTREAM_UNAVAILABLE) so the client needs only one dict entry.
export type ApiErrorCode =
  // Auth / authorization
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  // Validation
  | "INVALID_INPUT"
  | "INVALID_IMAGE"
  | "PHOTO_LIMIT"
  // Not found
  | "PROVIDER_NOT_FOUND"
  | "REVIEW_NOT_FOUND"
  | "REPORT_NOT_FOUND"
  | "PHOTO_NOT_FOUND"
  // Review write gates
  | "CANNOT_REVIEW_OWN_PROFILE"
  | "EMAIL_NOT_VERIFIED"
  | "INTERACTION_REQUIRED"
  | "NOT_REVIEW_OWNER"
  // Peer / infrastructure
  | "UPSTREAM_UNAVAILABLE"
  // Framework fallbacks (app.ts notFound / onError)
  | "NOT_FOUND"
  | "INTERNAL";

// c.json({ error, code }, status) with the code slot enforced. Use everywhere a
// route returns a user-facing error so the response shape stays uniform.
export function jsonError(
  c: Context,
  status: ContentfulStatusCode,
  code: ApiErrorCode,
  error: string
) {
  return c.json({ error, code }, status);
}
