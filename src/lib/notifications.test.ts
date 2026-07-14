import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_TYPES,
  notificationText,
  notificationTypeLabel,
} from "./notifications";

// Representative valid payloads, mirroring notification-service's per-type
// zod contracts (services/notification-service/src/lib/events.ts).
const PAYLOADS: Record<string, Record<string, unknown>> = {
  NEW_INQUIRY: { customerName: "Kasun" },
  THREAD_REPLY: { senderName: "Sunil Perera" },
  NEW_REVIEW: { reviewerName: "Kasun", rating: 5 },
  REVIEW_RESPONSE: { providerName: "Sunil Perera" },
  VERIFICATION_APPROVED: {},
  VERIFICATION_REJECTED: { reason: "ID photo unreadable" },
  NEW_JOB_MATCH: { jobTitle: "Retile a bathroom", district: "Matara" },
  JOB_RESPONSE: { providerName: "Sunil Perera", jobTitle: "Retile a bathroom" },
  SAVED_SEARCH_MATCH: { providerName: "Sunil Perera", district: "Colombo" },
  REPORT_RESOLVED: { targetType: "review", status: "RESOLVED" },
};

describe("notificationText (read-time render map)", () => {
  it("renders a sentence for every catalog type in both locales", () => {
    for (const type of NOTIFICATION_TYPES) {
      const en = notificationText({ type, payload: PAYLOADS[type] }, "en");
      const si = notificationText({ type, payload: PAYLOADS[type] }, "si");
      expect(en, `${type} (en)`).not.toBe("");
      expect(si, `${type} (si)`).not.toBe("");
      // A locale switch must actually change the sentence.
      expect(si, `${type} localized`).not.toBe(en);
    }
  });

  it("interpolates the payload facts", () => {
    expect(
      notificationText(
        { type: "NEW_INQUIRY", payload: PAYLOADS.NEW_INQUIRY },
        "en"
      )
    ).toContain("Kasun");
    expect(
      notificationText({ type: "NEW_REVIEW", payload: PAYLOADS.NEW_REVIEW }, "en")
    ).toContain("5-star");
    expect(
      notificationText(
        { type: "JOB_RESPONSE", payload: PAYLOADS.JOB_RESPONSE },
        "en"
      )
    ).toContain("Retile a bathroom");
  });

  it("localizes district names under the Sinhala locale", () => {
    const si = notificationText(
      { type: "NEW_JOB_MATCH", payload: PAYLOADS.NEW_JOB_MATCH },
      "si"
    );
    expect(si).toContain("මාතර");
    expect(si).not.toContain("Matara");
  });

  it("distinguishes resolved from dismissed reports", () => {
    const resolved = notificationText(
      { type: "REPORT_RESOLVED", payload: { status: "RESOLVED" } },
      "en"
    );
    const dismissed = notificationText(
      { type: "REPORT_RESOLVED", payload: { status: "DISMISSED" } },
      "en"
    );
    expect(resolved).not.toBe(dismissed);
  });

  it("degrades to the generic line for an unknown type", () => {
    expect(notificationText({ type: "FUTURE_TYPE", payload: {} }, "en")).toBe(
      "You have a new notification."
    );
  });

  it("never renders 'undefined' from a malformed payload", () => {
    for (const type of NOTIFICATION_TYPES) {
      for (const payload of [null, {}, { junk: 42 }]) {
        const text = notificationText({ type, payload }, "en");
        expect(text, `${type} with ${JSON.stringify(payload)}`).not.toContain(
          "undefined"
        );
        expect(text).not.toBe("");
      }
    }
  });
});

describe("notificationTypeLabel (preferences rows)", () => {
  it("labels every catalog type in both locales (no enum fallback)", () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(notificationTypeLabel(type, "en"), `${type} (en)`).not.toBe(type);
      expect(notificationTypeLabel(type, "si"), `${type} (si)`).not.toBe(type);
    }
  });

  it("falls back to the raw value for an unknown type", () => {
    expect(notificationTypeLabel("FUTURE_TYPE", "en")).toBe("FUTURE_TYPE");
  });
});
