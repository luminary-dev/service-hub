export const SORT_KEYS = [
  "recommended",
  "rating",
  "reviews",
  "price",
  "experience",
  "newest",
] as const;

export type SortKey = (typeof SORT_KEYS)[number];

export const DEFAULT_SORT: SortKey = "recommended";

export function normalizeSort(value: unknown): SortKey {
  return SORT_KEYS.includes(value as SortKey)
    ? (value as SortKey)
    : DEFAULT_SORT;
}

// Fields the comparators need. `rating` is the plain average (null when no
// reviews); `ratingSum` is the total, used for the Bayesian recommended score.
export type Sortable = {
  rating: number | null;
  ratingSum: number;
  reviewCount: number;
  fromPrice: number | null;
  experience: number;
  createdAt: Date;
  verified: boolean;
};

// Bayesian rating pulls low-volume profiles toward a sensible prior so a single
// 5-star review doesn't outrank a long track record; a small recency boost fades
// in fresh profiles without letting recency dominate quality.
const PRIOR_COUNT = 3;
const PRIOR_MEAN = 4.0;
const RECENCY_WEIGHT = 0.6;
const RECENCY_HALFLIFE_DAYS = 45;
const VERIFIED_BOOST = 0.75;

function recommendedScore(p: Sortable, now: number) {
  const bayes =
    (p.ratingSum + PRIOR_MEAN * PRIOR_COUNT) / (p.reviewCount + PRIOR_COUNT);
  const ageDays = (now - p.createdAt.getTime()) / 86_400_000;
  const recency = RECENCY_WEIGHT * Math.exp(-ageDays / RECENCY_HALFLIFE_DAYS);
  const verified = p.verified ? VERIFIED_BOOST : 0;
  return bayes + recency + verified;
}

// null prices/ratings always sort last regardless of direction.
function nullsLast(a: number | null, b: number | null, cmp: (x: number, y: number) => number) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return cmp(a, b);
}

export function sortProviders<T extends Sortable>(items: T[], key: SortKey): T[] {
  const now = Date.now();
  const byNewest = (a: T, b: T) => b.createdAt.getTime() - a.createdAt.getTime();
  const sorted = [...items];

  switch (key) {
    case "rating":
      sorted.sort(
        (a, b) =>
          nullsLast(a.rating, b.rating, (x, y) => y - x) ||
          b.reviewCount - a.reviewCount ||
          byNewest(a, b)
      );
      break;
    case "reviews":
      sorted.sort(
        (a, b) =>
          b.reviewCount - a.reviewCount ||
          (b.rating ?? 0) - (a.rating ?? 0) ||
          byNewest(a, b)
      );
      break;
    case "price":
      sorted.sort(
        (a, b) =>
          nullsLast(a.fromPrice, b.fromPrice, (x, y) => x - y) ||
          (b.rating ?? 0) - (a.rating ?? 0) ||
          byNewest(a, b)
      );
      break;
    case "experience":
      sorted.sort(
        (a, b) =>
          b.experience - a.experience ||
          (b.rating ?? 0) - (a.rating ?? 0) ||
          byNewest(a, b)
      );
      break;
    case "newest":
      sorted.sort(byNewest);
      break;
    case "recommended":
    default:
      sorted.sort(
        (a, b) =>
          recommendedScore(b, now) - recommendedScore(a, now) || byNewest(a, b)
      );
  }
  return sorted;
}
