import { z } from "zod";

export const MAX_REVIEW_PHOTOS = 3;

// Optional per-dimension sub-ratings (#528). Each is 1–5 when present and
// simply omitted when the reviewer leaves it blank — never a hard requirement,
// so the overall `rating` remains the only mandatory score.
export const REVIEW_DIMENSIONS = [
  "quality",
  "punctuality",
  "value",
  "communication",
] as const;

export type ReviewDimension = (typeof REVIEW_DIMENSIONS)[number];

const optionalDimension = z.number().int().min(1).max(5).optional();

// Overall rating stays mandatory (the authoritative score); the four
// dimensions are additive and optional.
export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(3).max(1000),
  quality: optionalDimension,
  punctuality: optionalDimension,
  value: optionalDimension,
  communication: optionalDimension,
});
