// Provider quality signal (#229): a simple, explainable 0-100 score admins
// can scan on the moderation list/detail views without piecing together
// reviews and reports by hand. Pure so it can be unit-tested without a
// database.
//
// Formula:
//   ratingComponent = reviewCount > 0 ? (rating / 5) * 100 : NEUTRAL_RATING_COMPONENT
//   reportPenalty    = min(openReportCount * REPORT_PENALTY_PER_REPORT, 100)
//   qualityScore     = clamp(round(ratingComponent - reportPenalty), 0, 100)
//
// A provider with no reviews yet gets a neutral baseline rather than 0 — the
// score is a quality/risk signal, not a popularity contest, so "unreviewed"
// shouldn't look worse than "reviewed poorly". Only OPEN reports penalize;
// resolved/dismissed reports have already been triaged and cleared.
//
// Deliberately out of scope for now (see #229): job-service response-rate
// data and review/photo removal history — both are documented future
// enhancements once that data is easily joinable from provider-service.
const NEUTRAL_RATING_COMPONENT = 70;
const REPORT_PENALTY_PER_REPORT = 15;

export type QualityScoreInput = {
  // Average star rating from review-service, 0-5. Ignored when reviewCount
  // is 0 (no signal yet).
  rating: number;
  reviewCount: number;
  openReportCount: number;
};

export type QualityScore = {
  qualityScore: number; // 0-100, the headline number
  ratingComponent: number; // 0-100, contribution from reviews
  reportPenalty: number; // 0-100, points deducted for open reports
};

export function computeQualityScore({
  rating,
  reviewCount,
  openReportCount,
}: QualityScoreInput): QualityScore {
  const ratingComponent =
    reviewCount > 0
      ? Math.max(0, Math.min(100, (rating / 5) * 100))
      : NEUTRAL_RATING_COMPONENT;
  const reportPenalty = Math.min(
    Math.max(openReportCount, 0) * REPORT_PENALTY_PER_REPORT,
    100
  );
  const qualityScore = Math.round(
    Math.max(0, Math.min(100, ratingComponent - reportPenalty))
  );
  return {
    qualityScore,
    ratingComponent: Math.round(ratingComponent),
    reportPenalty: Math.round(reportPenalty),
  };
}
