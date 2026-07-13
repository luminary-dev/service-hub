import { describe, it, expect } from "vitest";
import { resolveRoute } from "./routes";

describe("resolveRoute (routing table)", () => {
  it("routes auth and favorites to identity", () => {
    expect(resolveRoute("/api/auth/login")).toEqual({ service: "identity", path: "/api/auth/login" });
    expect(resolveRoute("/api/auth/me")).toEqual({ service: "identity", path: "/api/auth/me" });
    expect(resolveRoute("/api/favorites")).toEqual({ service: "identity", path: "/api/favorites" });
    expect(resolveRoute("/api/favorites/prov-1")).toEqual({ service: "identity", path: "/api/favorites/prov-1" });
  });

  it("routes admin user management to identity-service (#220 carve-out)", () => {
    expect(resolveRoute("/api/admin/users")).toEqual({ service: "identity", path: "/api/admin/users" });
    expect(resolveRoute("/api/admin/users/user-1")).toEqual({
      service: "identity",
      path: "/api/admin/users/user-1",
    });
    expect(resolveRoute("/api/admin/users/user-1/force-logout")).toEqual({
      service: "identity",
      path: "/api/admin/users/user-1/force-logout",
    });
  });

  it("routes account history to the owning services", () => {
    expect(resolveRoute("/api/account/inquiries")).toEqual({
      service: "provider",
      path: "/api/account/inquiries",
    });
    expect(resolveRoute("/api/account/reviews")).toEqual({
      service: "review",
      path: "/api/account/reviews",
    });
    expect(resolveRoute("/api/account")).toBeNull();
    expect(resolveRoute("/api/account/other")).toBeNull();
    expect(resolveRoute("/api/account/inquiries/x")).toBeNull();
  });

  it("routes provider reviews to review-service (carve-out)", () => {
    expect(resolveRoute("/api/providers/prov-1/reviews")).toEqual({
      service: "review",
      path: "/api/providers/prov-1/reviews",
    });
  });

  it("routes reviews and admin reviews to review-service", () => {
    expect(resolveRoute("/api/reviews/photos/ph-1")).toEqual({
      service: "review",
      path: "/api/reviews/photos/ph-1",
    });
    expect(resolveRoute("/api/admin/reviews/rev-1")).toEqual({
      service: "review",
      path: "/api/admin/reviews/rev-1",
    });
  });

  it("routes abuse reports to the service that owns the target (#50)", () => {
    expect(resolveRoute("/api/providers/prov-1/report")).toEqual({
      service: "provider",
      path: "/api/providers/prov-1/report",
    });
    expect(resolveRoute("/api/photos/ph-1/report")).toEqual({
      service: "provider",
      path: "/api/photos/ph-1/report",
    });
    expect(resolveRoute("/api/reviews/rev-1/report")).toEqual({
      service: "review",
      path: "/api/reviews/rev-1/report",
    });
    // Job posts and inquiry thread messages are reportable too (#376).
    expect(resolveRoute("/api/jobs/job-1/report")).toEqual({
      service: "job",
      path: "/api/jobs/job-1/report",
    });
    expect(resolveRoute("/api/messages/msg-1/report")).toEqual({
      service: "provider",
      path: "/api/messages/msg-1/report",
    });
    // Only the report action exists under /api/messages.
    expect(resolveRoute("/api/messages/msg-1")).toBeNull();
    expect(resolveRoute("/api/messages")).toBeNull();
    // Only the report action exists under /api/photos.
    expect(resolveRoute("/api/photos/ph-1")).toBeNull();
    expect(resolveRoute("/api/photos")).toBeNull();
  });

  it("routes the admin report queues to their owning services (#50)", () => {
    expect(resolveRoute("/api/admin/reports")).toEqual({
      service: "provider",
      path: "/api/admin/reports",
    });
    expect(resolveRoute("/api/admin/reports/rep-1")).toEqual({
      service: "provider",
      path: "/api/admin/reports/rep-1",
    });
    expect(resolveRoute("/api/admin/review-reports")).toEqual({
      service: "review",
      path: "/api/admin/review-reports",
    });
    expect(resolveRoute("/api/admin/review-reports/rep-1")).toEqual({
      service: "review",
      path: "/api/admin/review-reports/rep-1",
    });
    expect(resolveRoute("/api/admin/job-reports")).toEqual({
      service: "job",
      path: "/api/admin/job-reports",
    });
    expect(resolveRoute("/api/admin/job-reports/rep-1")).toEqual({
      service: "job",
      path: "/api/admin/job-reports/rep-1",
    });
  });

  it("routes the admin notification-badge counts endpoints (#233)", () => {
    expect(resolveRoute("/api/admin/notifications/counts")).toEqual({
      service: "provider",
      path: "/api/admin/notifications/counts",
    });
    expect(resolveRoute("/api/admin/review-reports/count")).toEqual({
      service: "review",
      path: "/api/admin/review-reports/count",
    });
    expect(resolveRoute("/api/admin/job-reports/count")).toEqual({
      service: "job",
      path: "/api/admin/job-reports/count",
    });
  });

  it("routes the admin audit logs to their owning services (#227)", () => {
    expect(resolveRoute("/api/admin/audit-log")).toEqual({
      service: "provider",
      path: "/api/admin/audit-log",
    });
    expect(resolveRoute("/api/admin/review-audit-log")).toEqual({
      service: "review",
      path: "/api/admin/review-audit-log",
    });
    expect(resolveRoute("/api/admin/job-audit-log")).toEqual({
      service: "job",
      path: "/api/admin/job-audit-log",
    });
  });

  it("routes admin impersonation ('view as', #234) to identity-service", () => {
    expect(resolveRoute("/api/admin/impersonate/user_1")).toEqual({
      service: "identity",
      path: "/api/admin/impersonate/user_1",
    });
    expect(resolveRoute("/api/admin/impersonate/someone%40example.com")).toEqual({
      service: "identity",
      path: "/api/admin/impersonate/someone%40example.com",
    });
    expect(resolveRoute("/api/admin/impersonate/end")).toEqual({
      service: "identity",
      path: "/api/admin/impersonate/end",
    });
  });

  it("routes admin job management to job-service (#222)", () => {
    expect(resolveRoute("/api/admin/jobs")).toEqual({ service: "job", path: "/api/admin/jobs" });
    expect(resolveRoute("/api/admin/jobs/job-1")).toEqual({
      service: "job",
      path: "/api/admin/jobs/job-1",
    });
  });

  it("routes the admin dashboard analytics endpoints to their owning services (#219)", () => {
    expect(resolveRoute("/api/admin/signups")).toEqual({
      service: "identity",
      path: "/api/admin/signups",
    });
    expect(resolveRoute("/api/admin/review-stats")).toEqual({
      service: "review",
      path: "/api/admin/review-stats",
    });
    expect(resolveRoute("/api/admin/stats")).toEqual({
      service: "provider",
      path: "/api/admin/stats",
    });
  });

  it("routes the rest of admin to provider-service", () => {
    expect(resolveRoute("/api/admin/providers")).toEqual({ service: "provider", path: "/api/admin/providers" });
    expect(resolveRoute("/api/admin/providers/prov-1")).toEqual({
      service: "provider",
      path: "/api/admin/providers/prov-1",
    });
    expect(resolveRoute("/api/admin/verifications")).toEqual({
      service: "provider",
      path: "/api/admin/verifications",
    });
    expect(resolveRoute("/api/admin/photos/ph-1")).toEqual({ service: "provider", path: "/api/admin/photos/ph-1" });
  });

  it("routes providers, provider dashboard and stats to provider-service", () => {
    expect(resolveRoute("/api/providers")).toEqual({ service: "provider", path: "/api/providers" });
    expect(resolveRoute("/api/providers/ids")).toEqual({ service: "provider", path: "/api/providers/ids" });
    expect(resolveRoute("/api/providers/prov-1")).toEqual({ service: "provider", path: "/api/providers/prov-1" });
    expect(resolveRoute("/api/providers/prov-1/full")).toEqual({
      service: "provider",
      path: "/api/providers/prov-1/full",
    });
    expect(resolveRoute("/api/providers/prov-1/inquiries")).toEqual({
      service: "provider",
      path: "/api/providers/prov-1/inquiries",
    });
    expect(resolveRoute("/api/provider/dashboard")).toEqual({ service: "provider", path: "/api/provider/dashboard" });
    expect(resolveRoute("/api/provider/photos")).toEqual({ service: "provider", path: "/api/provider/photos" });
    expect(resolveRoute("/api/stats")).toEqual({ service: "provider", path: "/api/stats" });
  });

  it("routes categories to provider-service", () => {
    expect(resolveRoute("/api/categories")).toEqual({
      service: "provider",
      path: "/api/categories",
    });
    expect(resolveRoute("/api/admin/categories")).toEqual({
      service: "provider",
      path: "/api/admin/categories",
    });
    expect(resolveRoute("/api/admin/categories/plumber")).toEqual({
      service: "provider",
      path: "/api/admin/categories/plumber",
    });
  });

  it("routes jobs to job-service", () => {
    expect(resolveRoute("/api/jobs")).toEqual({ service: "job", path: "/api/jobs" });
    expect(resolveRoute("/api/jobs/board")).toEqual({ service: "job", path: "/api/jobs/board" });
    expect(resolveRoute("/api/jobs/job-1/responses")).toEqual({
      service: "job",
      path: "/api/jobs/job-1/responses",
    });
  });

  it("routes /api/files/* to media-service, preserving the namespace", () => {
    expect(resolveRoute("/api/files/provider/avatars/a.jpg")).toEqual({
      service: "media",
      path: "/files/provider/avatars/a.jpg",
    });
    expect(resolveRoute("/api/files/review/reviews/r.png")).toEqual({
      service: "media",
      path: "/files/review/reviews/r.png",
    });
    // Work photos under the provider namespace still go to media unchanged.
    expect(resolveRoute("/api/files/provider/uploads/w.jpg")).toEqual({
      service: "media",
      path: "/files/provider/uploads/w.jpg",
    });
  });

  it("routes provider verification documents to provider-service, NOT media (#500)", () => {
    // PII (NIC / business-registration scans) must be admin-gated, so the
    // verification prefix is carved out of the public media forward and handed
    // to provider-service's gated serve route (path unchanged).
    expect(resolveRoute("/api/files/provider/verification/doc.jpg")).toEqual({
      service: "provider",
      path: "/api/files/provider/verification/doc.jpg",
    });
  });

  it("never forwards /internal paths", () => {
    expect(resolveRoute("/api/jobs/internal/jobs/count")).toBeNull();
    expect(resolveRoute("/api/providers/internal")).toBeNull();
    expect(resolveRoute("/api/auth/%2Finternal/users")).toBeNull();
    expect(resolveRoute("/internal/users")).toBeNull();
  });

  it("never forwards multi-encoded /internal paths (decode-until-stable)", () => {
    // Double-encoded %2F → %252F. A single decode leaves "%2Finternal", so a
    // one-shot guard would forward this; decode-until-stable catches it.
    expect(resolveRoute("/api/auth/%252Finternal/users")).toBeNull();
    expect(resolveRoute("/api/auth/%252finternal/users")).toBeNull();
    // Deeper nesting (triple-encoded) is caught too.
    expect(resolveRoute("/api/auth/%25252Finternal/users")).toBeNull();
    // Encoded on the "internal" literal itself.
    expect(resolveRoute("/api/jobs/%252Finternal%252Fjobs")).toBeNull();
  });

  it("does not throw on malformed percent-encoding, refuses to route", () => {
    // A bare % (or truncated sequence) makes decodeURIComponent throw; the
    // guard must treat that as suspicious rather than crash.
    expect(() => resolveRoute("/api/providers/%")).not.toThrow();
    expect(resolveRoute("/api/providers/%")).toBeNull();
    expect(resolveRoute("/api/auth/%zz/login")).toBeNull();
    // Malformed encoding that would otherwise be a valid public route.
    expect(resolveRoute("/api/jobs/%E0%A4%A")).toBeNull();
  });

  it("still resolves normal percent-encoded public paths", () => {
    // Innocuous encoding (an @ in an email-ish segment) must not be mistaken
    // for an /internal smuggling attempt.
    expect(resolveRoute("/api/admin/impersonate/a%40b.com")).toEqual({
      service: "identity",
      path: "/api/admin/impersonate/a%40b.com",
    });
  });

  it("routes inquiry message threads to provider-service", () => {
    expect(resolveRoute("/api/inquiries/inq_1/messages")).toEqual({
      service: "provider",
      path: "/api/inquiries/inq_1/messages",
    });
    // No bare list endpoint — only per-thread paths exist.
    expect(resolveRoute("/api/inquiries")).toBeNull();
  });

  it("returns null for anything else", () => {
    expect(resolveRoute("/api/unknown")).toBeNull();
    expect(resolveRoute("/api/authx/login")).toBeNull();
    expect(resolveRoute("/api/favoritesx")).toBeNull();
    expect(resolveRoute("/api/providersx")).toBeNull();
    expect(resolveRoute("/api/jobsx")).toBeNull();
    expect(resolveRoute("/api/statsx")).toBeNull();
    expect(resolveRoute("/other")).toBeNull();
  });
});
