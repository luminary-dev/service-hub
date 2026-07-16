import { describe, it, expect } from "vitest";
import {
  normalizeTake,
  toPublicReview,
  DEFAULT_REVIEWS_TAKE,
  MAX_REVIEWS_TAKE,
  type ReviewDTO,
} from "./provider-reviews";

describe("normalizeTake", () => {
  it("falls back to the default for junk or missing input", () => {
    expect(normalizeTake(undefined)).toBe(DEFAULT_REVIEWS_TAKE);
    expect(normalizeTake(null)).toBe(DEFAULT_REVIEWS_TAKE);
    expect(normalizeTake("abc")).toBe(DEFAULT_REVIEWS_TAKE);
    expect(normalizeTake("0")).toBe(DEFAULT_REVIEWS_TAKE);
    expect(normalizeTake("-3")).toBe(DEFAULT_REVIEWS_TAKE);
  });

  it("parses valid values and floors fractions", () => {
    expect(normalizeTake("10")).toBe(10);
    expect(normalizeTake("7.9")).toBe(7);
  });

  it("caps at the maximum", () => {
    expect(normalizeTake("1000")).toBe(MAX_REVIEWS_TAKE);
  });

  it("honors a custom fallback", () => {
    expect(normalizeTake(null, 10)).toBe(10);
  });
});

describe("toPublicReview", () => {
  const full: ReviewDTO = {
    id: "rev1",
    providerId: "prov1",
    userId: "user_secret",
    rating: 5,
    comment: "Great, tidy work.",
    verified: true,
    deletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    user: { name: "Nimal" },
    photos: [
      {
        id: "ph1",
        url: "reviews/ph1.jpg",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        deletedAt: null,
      },
    ],
    response: {
      text: "Thank you!",
      createdAt: new Date("2026-01-02T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    },
  };

  it("strips userId and deletedAt from the public shape (audit L6)", () => {
    const pub = toPublicReview(full);
    expect(pub).not.toHaveProperty("userId");
    expect(pub).not.toHaveProperty("deletedAt");
    // A scraper must not be able to read the reviewer id off any nested field.
    expect(JSON.stringify(pub)).not.toContain("user_secret");
  });

  it("keeps exactly the fields the public UI renders", () => {
    expect(toPublicReview(full)).toEqual({
      id: "rev1",
      providerId: "prov1",
      rating: 5,
      comment: "Great, tidy work.",
      verified: true,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      user: { name: "Nimal" },
      photos: [
        { id: "ph1", url: "reviews/ph1.jpg", createdAt: new Date("2026-01-01T00:00:00Z") },
      ],
      // Provider's public reply (#395) is public data and rides along.
      response: {
        text: "Thank you!",
        createdAt: new Date("2026-01-02T00:00:00Z"),
        updatedAt: new Date("2026-01-02T00:00:00Z"),
      },
    });
  });
});
