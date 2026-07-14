import { Hono } from "hono";
import { db } from "../db";
import { logAudit } from "../lib/audit";
import { moderateContent } from "../lib/auto-report";
import { getAuth, getLocale, getOrigin, s2s } from "../lib/http";
import { emitNotification } from "../lib/notify";
import {
  listProviderReviews,
  normalizeTake,
  toPublicReview,
} from "../lib/provider-reviews";
import {
  InvalidImageError,
  removeStoredFile,
  storeImage,
  validateImage,
} from "../lib/storage";
import { fetchRatingSummary } from "../lib/rating-summary";
import { pushRatingsToSearchIndex } from "../lib/search-index";
import {
  MAX_REVIEW_PHOTOS,
  REVIEW_DIMENSIONS,
  reviewResponseSchema,
  reviewSchema,
} from "../lib/validation";

const PROVIDER_SERVICE_URL = process.env.PROVIDER_SERVICE_URL ?? "http://localhost:4002";
const IDENTITY_SERVICE_URL =
  process.env.IDENTITY_SERVICE_URL ?? "http://localhost:4001";

// `contactEmail` (optional for rollout safety against an older provider-service)
// addresses the owner's new-review notification.
type ProviderSummary = {
  id: string;
  userId: string;
  suspended: boolean;
  contactEmail?: string;
};

// Review gate (#25): a review must be backed by a real interaction — the
// reviewer having sent this provider an inquiry through the platform. The
// inquiry is owned by provider-service (see its /internal/inquiries/exists,
// which matches on providerId+userId; anonymous inquiries carry no userId and
// never match). This is now a HARD gate on the write path, not just a badge:
// no interaction => the create is rejected (403). Because it decides whether a
// write is allowed, it fails loudly — a genuine upstream failure throws so the
// caller returns 502 rather than silently allowing (or silently blocking) a
// review. The single idempotent-GET retry lives in `s2s`.
class InteractionCheckError extends Error {}

async function hasPriorInteraction(
  providerId: string,
  userId: string
): Promise<boolean> {
  let res: Response;
  try {
    res = await s2s(
      PROVIDER_SERVICE_URL,
      `/internal/inquiries/exists?providerId=${encodeURIComponent(providerId)}&userId=${encodeURIComponent(userId)}`
    );
  } catch (e) {
    throw new InteractionCheckError(`inquiry check request failed: ${String(e)}`);
  }
  if (!res.ok) {
    throw new InteractionCheckError(`inquiry check returned ${res.status}`);
  }
  const data = (await res.json()) as { exists?: boolean };
  return data.exists === true;
}

// Verified-email gate (#115): a review is a public, provider-visible signal, so
// a signed-in reviewer must have confirmed their email first — same rule
// job-service applies to posting a job and provider-service to sending an
// inquiry. Reuses the identity /internal/users lookup. Like the interaction
// gate above this decides whether a write is allowed, so an upstream failure
// fails LOUDLY (throws → the caller returns 502) rather than silently allowing
// or blocking. The single idempotent-GET retry lives in s2s.
async function isEmailVerified(userId: string): Promise<boolean> {
  let res: Response;
  try {
    res = await s2s(
      IDENTITY_SERVICE_URL,
      `/internal/users?ids=${encodeURIComponent(userId)}`
    );
  } catch (e) {
    throw new InteractionCheckError(`user lookup request failed: ${String(e)}`);
  }
  if (!res.ok) {
    throw new InteractionCheckError(`user lookup returned ${res.status}`);
  }
  const data = (await res.json()) as {
    users?: { id: string; emailVerified: string | null }[];
  };
  return Boolean(data.users?.find((u) => u.id === userId)?.emailVerified);
}

export const reviews = new Hono();

// Public paginated reviews for a profile page's lazy-loading (the gateway's
// /api/providers/:id/reviews route is method-agnostic, so GET lands here and
// POST below). Pages default to 10, capped at 100. If the provider-existence
// check itself fails we still serve — reviews are public read data and a peer
// outage must not blank them; suspended providers 404 like their profile.
reviews.get("/api/providers/:id/reviews", async (c) => {
  const id = c.req.param("id");
  try {
    const res = await s2s(PROVIDER_SERVICE_URL, `/internal/providers/${id}/summary`);
    if (res.ok) {
      const data = (await res.json()) as { provider: ProviderSummary | null };
      if (!data.provider || data.provider.suspended) {
        return c.json({ error: "Provider not found" }, 404);
      }
    }
  } catch {
    // degrade open
  }

  // `summary` (#528) aggregates over ALL of the provider's non-deleted reviews
  // (not just this page) so the profile can render the dimension breakdown and
  // 5→1 star distribution accurately regardless of pagination. The web profile
  // reads it directly here — no provider-service/gateway change needed.
  const [{ reviews: page, nextCursor }, summary] = await Promise.all([
    listProviderReviews(id, {
      take: normalizeTake(c.req.query("take"), 10),
      cursor: c.req.query("cursor") || undefined,
    }),
    fetchRatingSummary(id),
  ]);
  // Project to the PUBLIC shape before responding: this endpoint returns JSON
  // straight to any (even anonymous) client, so it must not leak the reviewer's
  // userId or moderation state (#L6). The internal /by-provider route keeps the
  // full DTO for the owner/admin paths that legitimately need userId.
  return c.json({ reviews: page.map(toPublicReview), nextCursor, summary });
});

// Port of the monolith's POST /api/providers/[id]/reviews (rate limiting now
// lives in the gateway). Upsert semantics: a user has one review per provider;
// posting again replaces rating/comment and appends photos up to the cap.
reviews.post("/api/providers/:id/reviews", async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: "Sign in to leave a review" }, 401);
  }

  const id = c.req.param("id");
  let provider: ProviderSummary | null = null;
  try {
    const res = await s2s(PROVIDER_SERVICE_URL, `/internal/providers/${id}/summary`);
    if (res.status === 404) {
      provider = null;
    } else if (!res.ok) {
      return c.json({ error: "Upstream service unavailable" }, 502);
    } else {
      const data = (await res.json()) as { provider: ProviderSummary | null };
      provider = data.provider ?? null;
    }
  } catch {
    return c.json({ error: "Upstream service unavailable" }, 502);
  }
  if (!provider) {
    return c.json({ error: "Provider not found" }, 404);
  }
  // A suspended provider's profile 404s (see the GET path); reviews must not be
  // creatable against it either — otherwise ratings keep accruing on a removed
  // provider and can even earn a `verified` badge.
  if (provider.suspended) {
    return c.json({ error: "Provider not found" }, 404);
  }
  if (provider.userId === auth.userId) {
    return c.json({ error: "You cannot review your own profile" }, 400);
  }

  // Verified-email gate (#115): checked before any form parsing / photo upload
  // so a blocked review never stores files. Fails loudly (502) on an identity
  // outage — never publish a review from a caller we couldn't verify.
  let verified: boolean;
  try {
    verified = await isEmailVerified(auth.userId);
  } catch {
    return c.json({ error: "Upstream service unavailable" }, 502);
  }
  if (!verified) {
    return c.json(
      { error: "Verify your email address to leave a review" },
      403
    );
  }

  // Gate on a real interaction (#25): a review is only creatable by someone who
  // has sent this provider an inquiry through the platform. Checked BEFORE any
  // form parsing / photo upload so a blocked review never stores files. A
  // genuine upstream failure fails loudly (502) — never allow a review we
  // couldn't verify, and never silently swallow a peer outage on a write gate.
  let interacted: boolean;
  try {
    interacted = await hasPriorInteraction(id, auth.userId);
  } catch {
    return c.json({ error: "Upstream service unavailable" }, 502);
  }
  if (!interacted) {
    return c.json(
      {
        error:
          "You can only review a provider you've contacted. Send them an inquiry first.",
      },
      403
    );
  }

  const form = await c.req.formData().catch(() => null);
  if (!form) {
    return c.json({ error: "Invalid input" }, 400);
  }
  // Optional per-dimension sub-ratings (#528): only read a dimension when the
  // form actually carries a value. A blank field becomes `undefined` (omitted)
  // rather than 0 — which would fail the 1–5 check — so on create the column
  // defaults to null and on edit an untouched dimension keeps its stored value.
  const dimensions: Record<string, number | undefined> = {};
  for (const dim of REVIEW_DIMENSIONS) {
    const raw = form.get(dim);
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    dimensions[dim] = trimmed === "" ? undefined : Number(trimmed);
  }
  const parsed = reviewSchema.safeParse({
    rating: Number(form.get("rating")),
    comment: String(form.get("comment") ?? ""),
    ...dimensions,
  });
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const files = form
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);

  // Validate and upload photos BEFORE mutating the review, so a rejected photo
  // batch (over the cap, or one media rejects) can't leave the rating/comment
  // already persisted.
  const photoUrls: string[] = [];
  if (files.length > 0) {
    const existing = await db.review.findUnique({
      where: { providerId_userId: { providerId: id, userId: auth.userId } },
      select: { _count: { select: { photos: true } } },
    });
    const remaining = MAX_REVIEW_PHOTOS - (existing?._count.photos ?? 0);
    if (files.length > remaining) {
      return c.json(
        { error: `A review can have at most ${MAX_REVIEW_PHOTOS} photos.` },
        400
      );
    }
    for (const file of files) {
      const check = validateImage(file);
      if (check) {
        return c.json({ error: check }, 400);
      }
    }
    for (const file of files) {
      try {
        photoUrls.push(await storeImage("review", file, "reviews"));
      } catch (e) {
        if (e instanceof InvalidImageError) return c.json({ error: e.message }, 400);
        throw e;
      }
    }
  }

  // Checked before the upsert so the NEW_REVIEW notification fires only on the
  // FIRST publish — editing a review must not re-ping the provider on every
  // save (#L6). Mirrors the review-response route's first-response gate.
  const existingReview = await db.review.findUnique({
    where: { providerId_userId: { providerId: id, userId: auth.userId } },
    select: { id: true },
  });

  const reviewId = await db.$transaction(async (tx) => {
    const review = await tx.review.upsert({
      where: { providerId_userId: { providerId: id, userId: auth.userId } },
      // Reaching here means the interaction gate passed, so every review we
      // write is a verified customer's. deletedAt is deliberately untouched —
      // editing a moderated review must not resurrect it (the admin's removal
      // stands until restored).
      create: { providerId: id, userId: auth.userId, verified: true, ...parsed.data },
      update: { ...parsed.data, verified: true },
      select: { id: true },
    });
    if (photoUrls.length > 0) {
      await tx.reviewPhoto.createMany({
        data: photoUrls.map((url) => ({ reviewId: review.id, url })),
      });
    }
    return review.id;
  });

  // Content filter (#375): AFTER the write on purpose — the review stays
  // visible and a filter hit only queues a SYSTEM report for admin triage.
  await moderateContent("REVIEW", reviewId, { comment: parsed.data.comment });

  // Search-index rating push (search RFC §4.2) — fire-and-forget, best-effort.
  void pushRatingsToSearchIndex([id]);

  // Tell the provider a review was published on their profile (#393): in-app
  // + email via the notification event — best-effort, never fails the review.
  // The owner's userId/contactEmail rode in on the summary fetched above. Only
  // a first publish notifies (#L6); an edit updates the review silently.
  if (!existingReview) {
    await emitNotification({
      type: "NEW_REVIEW",
      recipients: [
        { userId: provider.userId, email: provider.contactEmail, locale: getLocale(c) },
      ],
      payload: { reviewerName: auth.name, rating: parsed.data.rating },
      link: `/providers/${id}`,
      origin: getOrigin(c),
    });
  }

  return c.json({ ok: true });
});

// Provider responses to reviews (#395): the reviewed profile's OWNER may keep
// one public reply per review. Shared gate for the upsert + delete routes:
// load the (non-moderated) review, then verify over S2S that the caller owns
// the reviewed provider profile. Ownership decides whether a write is allowed,
// so an upstream failure fails loudly (502) — mirroring the review-create gate.
async function gateReviewResponse(
  reviewId: string,
  userId: string
): Promise<
  | { ok: true; review: { id: string; userId: string; providerId: string } }
  | { ok: false; status: 403 | 404 | 502; error: string }
> {
  const review = await db.review.findUnique({
    where: { id: reviewId },
    select: { id: true, userId: true, providerId: true, deletedAt: true },
  });
  // Soft-deleted reviews 404 like missing ones — the public page hides them,
  // and a response to a moderated review would be invisible anyway.
  if (!review || review.deletedAt) {
    return { ok: false, status: 404, error: "Review not found" };
  }

  let provider: ProviderSummary | null = null;
  try {
    const res = await s2s(
      PROVIDER_SERVICE_URL,
      `/internal/providers/${review.providerId}/summary`
    );
    if (res.status === 404) {
      provider = null;
    } else if (!res.ok) {
      return { ok: false, status: 502, error: "Upstream service unavailable" };
    } else {
      const data = (await res.json()) as { provider: ProviderSummary | null };
      provider = data.provider ?? null;
    }
  } catch {
    return { ok: false, status: 502, error: "Upstream service unavailable" };
  }
  // A suspended provider's profile (and its reviews) 404s publicly; it must
  // not keep posting replies either.
  if (!provider || provider.suspended || provider.userId !== userId) {
    return {
      ok: false,
      status: 403,
      error: "Only the reviewed provider can respond",
    };
  }
  return {
    ok: true,
    review: { id: review.id, userId: review.userId, providerId: review.providerId },
  };
}

// Create-or-edit (upsert — one response per review, so posting again replaces
// the text). Rate limiting lives in the gateway, same as review creation.
reviews.post("/api/reviews/:id/response", async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: "Sign in to respond" }, 401);
  }

  const gate = await gateReviewResponse(c.req.param("id"), auth.userId);
  if (!gate.ok) {
    return c.json({ error: gate.error }, gate.status);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = reviewResponseSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }

  // Checked before the upsert so only a FIRST response notifies the reviewer —
  // editing the reply must not re-ping them on every save.
  const existing = await db.reviewResponse.findUnique({
    where: { reviewId: gate.review.id },
    select: { id: true },
  });

  await db.reviewResponse.upsert({
    where: { reviewId: gate.review.id },
    create: { reviewId: gate.review.id, text: parsed.data.text },
    update: { text: parsed.data.text },
  });

  if (!existing) {
    // Tell the review's author the provider replied (#393): in-app + email via
    // the notification event — best-effort, never fails the response. The
    // author's email is hydrated from identity (a failed lookup degrades to
    // in-app only); providerName is the caller's identity-header name, which
    // the provider's public contactName mirrors (#553).
    let email: string | undefined;
    try {
      const res = await s2s(
        IDENTITY_SERVICE_URL,
        `/internal/users?ids=${encodeURIComponent(gate.review.userId)}`
      );
      if (res.ok) {
        const data = (await res.json()) as {
          users?: { id: string; email: string }[];
        };
        email = data.users?.find((u) => u.id === gate.review.userId)?.email;
      }
    } catch {
      // degrade to in-app only
    }
    await emitNotification({
      type: "REVIEW_RESPONSE",
      recipients: [{ userId: gate.review.userId, email, locale: getLocale(c) }],
      payload: { providerName: auth.name },
      link: `/providers/${gate.review.providerId}`,
      origin: getOrigin(c),
    });
  }

  return c.json({ ok: true });
});

// Remove the response. Idempotent: deleting a review with no response is a
// no-op 200 (deleteMany), matching the service's other best-effort removals.
reviews.delete("/api/reviews/:id/response", async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const gate = await gateReviewResponse(c.req.param("id"), auth.userId);
  if (!gate.ok) {
    return c.json({ error: gate.error }, gate.status);
  }

  await db.reviewResponse.deleteMany({ where: { reviewId: gate.review.id } });
  return c.json({ ok: true });
});

// Port of the monolith's DELETE /api/reviews/photos/[id].
reviews.delete("/api/reviews/photos/:id", async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const id = c.req.param("id");
  const photo = await db.reviewPhoto.findUnique({
    where: { id },
    include: { review: { select: { userId: true } } },
  });
  if (!photo) {
    return c.json({ error: "Photo not found" }, 404);
  }

  // The review's author can remove their own photo; admins can moderate any.
  const isOwner = photo.review.userId === auth.userId;
  const isAdmin = auth.role === "ADMIN";
  if (!isOwner && !isAdmin) {
    return c.json({ error: "Forbidden" }, 403);
  }

  await db.reviewPhoto.delete({ where: { id } });
  await removeStoredFile(photo.url); // best-effort (errors swallowed inside)

  return c.json({ ok: true });
});

// Admin moderation removal is a SOFT delete (#32): the row, photos and files
// all survive so the action is reversible via the restore endpoint below.
// Account erasure remains a hard delete regardless.
reviews.delete("/api/admin/reviews/:id", async (c) => {
  const auth = getAuth(c);
  if (auth?.role !== "ADMIN") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const id = c.req.param("id");
  // Resolve the provider before the write so the search-index rating push
  // below has its target even though updateMany itself returns no rows.
  const review = await db.review.findUnique({
    where: { id },
    select: { providerId: true },
  });
  // updateMany returns count 0 when the id doesn't exist; report that as a 404
  // rather than a misleading 200, and don't write a fabricated audit entry for
  // a review that was never touched (matches provider admin.ts photo restore).
  const { count } = await db.review.updateMany({
    where: { id },
    data: { deletedAt: new Date() },
  });
  if (count === 0) {
    return c.json({ error: "Review not found" }, 404);
  }
  await logAudit(c, "delete-review", "REVIEW", id);
  // A soft-deleted review leaves the aggregates — push the recount (search
  // RFC §4.2, fire-and-forget).
  if (review) void pushRatingsToSearchIndex([review.providerId]);
  return c.json({ ok: true });
});

reviews.patch("/api/admin/reviews/:id/restore", async (c) => {
  const auth = getAuth(c);
  if (auth?.role !== "ADMIN") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const id = c.req.param("id");
  const review = await db.review.findUnique({
    where: { id },
    select: { providerId: true },
  });
  // 404 (not a misleading 200) + no fabricated audit entry when the id doesn't
  // exist — matches the delete route above and provider admin.ts photo restore.
  const { count } = await db.review.updateMany({
    where: { id },
    data: { deletedAt: null },
  });
  if (count === 0) {
    return c.json({ error: "Review not found" }, 404);
  }
  await logAudit(c, "restore-review", "REVIEW", id);
  // Restoring re-enters the aggregates — push the recount (search RFC §4.2).
  if (review) void pushRatingsToSearchIndex([review.providerId]);
  return c.json({ ok: true });
});
