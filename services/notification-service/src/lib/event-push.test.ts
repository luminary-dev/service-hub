// Rendering tests for the push title/body map (#798): every catalog type
// renders in BOTH locales (push has no email-less exclusion — REPORT_RESOLVED
// renders too, since push follows the in-app channel), payload facts are
// interpolated, and the REPORT_RESOLVED status variants differ.
import { describe, expect, it } from "vitest";
import { renderEventPush } from "./event-push";
import { NOTIFICATION_TYPES } from "./events";

// One representative payload per type (the documented PAYLOAD_SCHEMAS shapes).
const PAYLOADS: Record<(typeof NOTIFICATION_TYPES)[number], Record<string, unknown>> = {
  NEW_INQUIRY: { customerName: "Dilani" },
  THREAD_REPLY: { senderName: "Nuwan" },
  NEW_REVIEW: { reviewerName: "Dilani", rating: 5 },
  REVIEW_RESPONSE: { providerName: "Nuwan" },
  VERIFICATION_APPROVED: {},
  VERIFICATION_REJECTED: { reason: "blurry scan" },
  NEW_JOB_MATCH: { jobTitle: "Fix a tap", district: "Colombo" },
  JOB_RESPONSE: { providerName: "Nuwan", jobTitle: "Fix a tap" },
  SAVED_SEARCH_MATCH: { providerName: "Kumari", district: "Gampaha" },
  REPORT_RESOLVED: { targetType: "REVIEW", status: "RESOLVED" },
};

describe("renderEventPush", () => {
  it("renders a non-empty title + body for every catalog type in both locales", () => {
    for (const type of NOTIFICATION_TYPES) {
      for (const locale of ["en", "si"] as const) {
        const { title, body } = renderEventPush(type, PAYLOADS[type], locale);
        expect(title.length, `${type} ${locale} title`).toBeGreaterThan(0);
        expect(body.length, `${type} ${locale} body`).toBeGreaterThan(0);
      }
    }
  });

  it("interpolates the payload facts", () => {
    expect(renderEventPush("NEW_INQUIRY", PAYLOADS.NEW_INQUIRY, "en").body).toBe(
      "Dilani sent you an inquiry."
    );
    expect(renderEventPush("NEW_REVIEW", PAYLOADS.NEW_REVIEW, "en").body).toBe(
      "Dilani left a 5-star review on your profile."
    );
    const jobMatch = renderEventPush("NEW_JOB_MATCH", PAYLOADS.NEW_JOB_MATCH, "en").body;
    expect(jobMatch).toContain("Fix a tap");
    expect(jobMatch).toContain("Colombo");
    const siReview = renderEventPush("NEW_REVIEW", PAYLOADS.NEW_REVIEW, "si").body;
    expect(siReview).toContain("Dilani");
    expect(siReview).toContain("5");
  });

  it("distinguishes the REPORT_RESOLVED status variants", () => {
    const resolved = renderEventPush(
      "REPORT_RESOLVED",
      { targetType: "REVIEW", status: "RESOLVED" },
      "en"
    );
    const dismissed = renderEventPush(
      "REPORT_RESOLVED",
      { targetType: "REVIEW", status: "DISMISSED" },
      "en"
    );
    expect(resolved.body).toContain("resolved");
    expect(dismissed.body).toContain("dismissed");
    expect(resolved.body).not.toBe(dismissed.body);
  });
});
