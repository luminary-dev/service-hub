// Unit tests for the shared content filter (#375) — canonical, identical in
// review-, provider- and job-service, like the module under test.
import { describe, expect, it } from "vitest";
import {
  MODERATION_REASON,
  checkFields,
  checkText,
  moderationDetails,
} from "./moderation";

describe("checkText", () => {
  it("returns null for ordinary English text", () => {
    expect(checkText("Great work, arrived on time and very tidy.")).toBeNull();
  });

  it("returns null for ordinary Sinhala text", () => {
    expect(checkText("ඉතා හොඳ සේවාවක්. නියමිත වේලාවට පැමිණියා.")).toBeNull();
  });

  it("flags English profanity with the matched term", () => {
    expect(checkText("This guy is a fucking scammer", "comment")).toEqual({
      term: "fucking",
      field: "comment",
    });
  });

  it("is case-insensitive", () => {
    expect(checkText("ABSOLUTE BULLSHIT")?.term).toBe("bullshit");
  });

  it("matches multi-word phrases across extra whitespace", () => {
    expect(checkText("you son  of\na bitch")?.term).toBe("son of a bitch");
  });

  it("does not flag clean words that contain a term (Scunthorpe guard)", () => {
    // "assess" contains "ass" variants' stems, "class" ends in a term-like
    // run, "Hittite"/"prickle" wrap listed terms — none may match.
    expect(checkText("first-class assessment of the prickly hedge")).toBeNull();
  });

  it("flags Sinhala-script profanity", () => {
    expect(checkText("මූ පට්ට පකයා", "comment")).toEqual({
      term: "පකයා",
      field: "comment",
    });
  });

  it("flags inflected Sinhala forms via substring matching", () => {
    // Suffix attached to the stem — no space before it.
    expect(checkText("හුත්තො ඔක්කොම")?.term).toBe("හුත්ත");
  });

  it("flags romanized Sinhala (Singlish) on word boundaries", () => {
    expect(checkText("mu hari pakaya machan")?.term).toBe("pakaya");
    // Not inside a longer word.
    expect(checkText("kopakayakda ona")).toBeNull();
  });

  it("ignores zero-width characters used to split a term", () => {
    expect(checkText("fu\u200Bck this")?.term).toBe("fuck");
  });

  it("normalizes full-width compatibility forms", () => {
    expect(checkText("ｆｕｃｋ ｙｏｕ")?.term).toBe("fuck");
  });
});

describe("checkFields", () => {
  it("returns the first hit with its field name and skips empty fields", () => {
    expect(
      checkFields({
        headline: "Reliable plumber",
        headlineSi: null,
        bio: "hutta kiyala kiyanna epa",
      })
    ).toEqual({ term: "hutta", field: "bio" });
  });

  it("returns null when every field is clean or empty", () => {
    expect(checkFields({ headline: "Reliable plumber", bio: undefined })).toBeNull();
  });
});

describe("moderationDetails", () => {
  it("names the term, field and a whitespace-collapsed excerpt", () => {
    const hit = { term: "fuck", field: "comment" };
    expect(moderationDetails(hit, "  what the\nfuck  ")).toBe(
      'content filter matched "fuck" in comment: "what the fuck"'
    );
  });

  it("truncates long content with an ellipsis and stays under the 500 cap", () => {
    const details = moderationDetails(
      { term: "fuck", field: "comment" },
      `fuck ${"x".repeat(400)}`
    );
    expect(details.endsWith('…"')).toBe(true);
    expect(details.length).toBeLessThan(500);
  });

  it("exports the auto-flag reason used by every service", () => {
    expect(MODERATION_REASON).toBe("auto-flag: content filter");
  });
});
