import { describe, it, expect } from "vitest";
import { computeQualityScore } from "./quality-score";

describe("computeQualityScore", () => {
  it("gives an unreviewed provider a neutral baseline", () => {
    expect(
      computeQualityScore({ rating: 0, reviewCount: 0, openReportCount: 0 })
    ).toEqual({ qualityScore: 70, ratingComponent: 70, reportPenalty: 0 });
  });

  it("scores a perfect rating with no reports at 100", () => {
    expect(
      computeQualityScore({ rating: 5, reviewCount: 12, openReportCount: 0 })
    ).toEqual({ qualityScore: 100, ratingComponent: 100, reportPenalty: 0 });
  });

  it("converts a mid rating to its percentage", () => {
    expect(
      computeQualityScore({ rating: 3, reviewCount: 4, openReportCount: 0 })
    ).toEqual({ qualityScore: 60, ratingComponent: 60, reportPenalty: 0 });
  });

  it("deducts points per open report", () => {
    expect(
      computeQualityScore({ rating: 4, reviewCount: 10, openReportCount: 2 })
    ).toEqual({ qualityScore: 50, ratingComponent: 80, reportPenalty: 30 });
  });

  it("floors at 0 rather than going negative", () => {
    expect(
      computeQualityScore({ rating: 2, reviewCount: 3, openReportCount: 10 })
    ).toEqual({ qualityScore: 0, ratingComponent: 40, reportPenalty: 100 });
  });

  it("ignores a negative report count defensively", () => {
    expect(
      computeQualityScore({ rating: 4, reviewCount: 1, openReportCount: -3 })
    ).toEqual({ qualityScore: 80, ratingComponent: 80, reportPenalty: 0 });
  });
});
