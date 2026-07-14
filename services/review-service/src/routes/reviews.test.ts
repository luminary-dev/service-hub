import { beforeEach, describe, expect, it, vi } from "vitest";

// The create path talks to provider-service via `s2s` for two things: the
// provider summary and the interaction (inquiry) check. Mock only `s2s` and
// keep the rest of lib/http real so the app's internal-secret middleware still
// runs (tests must present the secret, like a sibling service would).
vi.mock("../lib/http", async (importActual) => {
  const actual = await importActual<typeof import("../lib/http")>();
  return { ...actual, s2s: vi.fn() };
});

// The DB is never hit in these tests — the interaction gate decides the
// outcome before (or instead of) any write. `$transaction` runs the callback
// against a stub tx so the happy path can complete without Postgres. Defined
// via vi.hoisted so the (hoisted) vi.mock factory below can reference them.
const { upsert, createMany, reviewFindUnique, reportFindFirst, reportCreate, reportUpdate } =
  vi.hoisted(() => ({
    upsert: vi.fn(async (_args: unknown) => ({ id: "rev_1" })),
    createMany: vi.fn(async (_args: unknown) => ({ count: 0 })),
    // First-publish check for the NEW_REVIEW notification (#L6): null = no
    // existing review, so a first publish notifies; a row = an edit, silent.
    reviewFindUnique: vi.fn(async (_args: unknown): Promise<unknown> => null),
    // Content filter (#375): the auto-report path checks for an existing OPEN
    // SYSTEM report before filing one. Default: none exists.
    reportFindFirst: vi.fn(async (_args: unknown): Promise<unknown> => null),
    reportCreate: vi.fn(async (_args: unknown) => ({ id: "rep_1" })),
    reportUpdate: vi.fn(async (_args: unknown) => ({ id: "rep_1" })),
  }));
// Search-index rating pushes (search RFC) are fired (not awaited) from the
// review write/moderation paths.
vi.mock("../lib/search-index", () => ({
  pushRatingsToSearchIndex: vi.fn(() => Promise.resolve()),
}));
vi.mock("../db", () => ({
  db: {
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({ review: { upsert }, reviewPhoto: { createMany } }),
    review: { upsert, findUnique: reviewFindUnique },
    reviewPhoto: { createMany },
    report: { findFirst: reportFindFirst, create: reportCreate, update: reportUpdate },
  },
}));
vi.mock("../lib/notify", () => ({
  emitNotification: vi.fn().mockResolvedValue(undefined),
}));

import { app } from "../app";
import { s2s } from "../lib/http";
import { emitNotification } from "../lib/notify";

const SECRET = "dev-internal-secret";
const PROVIDER_ID = "prov_1";
const REVIEWER_ID = "user_reviewer";

const s2sMock = vi.mocked(s2s);

function providerSummaryResponse() {
  return new Response(
    JSON.stringify({
      provider: {
        id: PROVIDER_ID,
        userId: "user_owner",
        suspended: false,
        contactEmail: "owner@baas.lk",
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function inquiryExistsResponse(exists: boolean) {
  return new Response(JSON.stringify({ exists }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// Route s2s calls by path: the provider summary vs. the inquiry-exists check.
function wireS2s({
  interaction,
}: {
  interaction: "exists" | "none" | "fail-status" | "fail-throw";
}) {
  s2sMock.mockImplementation(async (_baseUrl: string, path: string) => {
    if (path.includes("/summary")) return providerSummaryResponse();
    if (path.includes("/internal/inquiries/exists")) {
      if (interaction === "exists") return inquiryExistsResponse(true);
      if (interaction === "none") return inquiryExistsResponse(false);
      if (interaction === "fail-status")
        return new Response("boom", { status: 503 });
      throw new Error("network down");
    }
    throw new Error(`unexpected s2s path: ${path}`);
  });
}

function postReview(headers: Record<string, string> = {}) {
  const form = new FormData();
  form.set("rating", "5");
  form.set("comment", "Excellent, punctual and tidy work.");
  return app.request(`/api/providers/${PROVIDER_ID}/reviews`, {
    method: "POST",
    headers: { "x-internal-secret": SECRET, "x-user-id": REVIEWER_ID, ...headers },
    body: form,
  });
}

beforeEach(() => {
  s2sMock.mockReset();
  upsert.mockClear();
  createMany.mockClear();
  reviewFindUnique.mockClear();
  reportFindFirst.mockClear();
  reportCreate.mockClear();
  reportUpdate.mockClear();
  vi.mocked(emitNotification).mockClear();
});

describe("POST /api/providers/:id/reviews — interaction gate (#25)", () => {
  it("allows a review when the reviewer has a prior inquiry with the provider", async () => {
    wireS2s({ interaction: "exists" });
    const res = await postReview();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // Persisted as a verified-customer review.
    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0][0] as unknown as {
      create: { verified: boolean };
      update: { verified: boolean };
    };
    expect(arg.create.verified).toBe(true);
    expect(arg.update.verified).toBe(true);
  });

  it("rejects with 403 when the reviewer has no interaction with the provider", async () => {
    wireS2s({ interaction: "none" });
    const res = await postReview();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/only review a provider you've contacted/i);
    // Nothing is written when the gate blocks.
    expect(upsert).not.toHaveBeenCalled();
  });

  it("fails loudly with 502 when the interaction check returns a server error", async () => {
    wireS2s({ interaction: "fail-status" });
    const res = await postReview();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Upstream service unavailable" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("fails loudly with 502 when the interaction check request throws", async () => {
    wireS2s({ interaction: "fail-throw" });
    const res = await postReview();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Upstream service unavailable" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("requires authentication before any interaction check", async () => {
    wireS2s({ interaction: "exists" });
    const res = await postReview({ "x-user-id": "" });
    expect(res.status).toBe(401);
    expect(s2sMock).not.toHaveBeenCalled();
  });

  // NEW_REVIEW notification (#393): the provider owner hears about a
  // published review in-app + by email through the generic ingestion event.
  it("emits NEW_REVIEW to the provider owner after the write", async () => {
    wireS2s({ interaction: "exists" });
    const res = await postReview({ "x-user-name": "Dilani" });
    expect(res.status).toBe(200);
    expect(emitNotification).toHaveBeenCalledWith({
      type: "NEW_REVIEW",
      recipients: [
        { userId: "user_owner", email: "owner@baas.lk", locale: "en" },
      ],
      payload: { reviewerName: "Dilani", rating: 5 },
      link: `/providers/${PROVIDER_ID}`,
      origin: expect.any(String),
    });
  });

  it("emits nothing when the gate blocks the review", async () => {
    wireS2s({ interaction: "none" });
    const res = await postReview();
    expect(res.status).toBe(403);
    expect(emitNotification).not.toHaveBeenCalled();
  });

  // #L6: editing an existing review must not re-ping the provider on every
  // save — only the first publish notifies (mirrors the response route).
  it("does NOT re-emit NEW_REVIEW when the review already existed (edit)", async () => {
    wireS2s({ interaction: "exists" });
    reviewFindUnique.mockResolvedValueOnce({ id: "rev_1" });
    const res = await postReview();
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(emitNotification).not.toHaveBeenCalled();
  });
});

// Optional per-dimension sub-ratings (#528).
function postReviewWith(fields: Record<string, string>) {
  const form = new FormData();
  form.set("rating", "5");
  form.set("comment", "Excellent, punctual and tidy work.");
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return app.request(`/api/providers/${PROVIDER_ID}/reviews`, {
    method: "POST",
    headers: { "x-internal-secret": SECRET, "x-user-id": REVIEWER_ID },
    body: form,
  });
}

describe("POST /api/providers/:id/reviews — optional dimensions (#528)", () => {
  it("persists the per-dimension sub-ratings when provided", async () => {
    wireS2s({ interaction: "exists" });
    const res = await postReviewWith({
      quality: "5",
      punctuality: "4",
      value: "3",
      communication: "5",
    });
    expect(res.status).toBe(200);
    const arg = upsert.mock.calls[0][0] as unknown as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(arg.create).toMatchObject({ quality: 5, punctuality: 4, value: 3, communication: 5 });
    expect(arg.update).toMatchObject({ quality: 5, punctuality: 4, value: 3, communication: 5 });
  });

  it("omits blank dimensions so they stay null on create / untouched on edit", async () => {
    wireS2s({ interaction: "exists" });
    const res = await postReviewWith({ quality: "4", punctuality: "" });
    expect(res.status).toBe(200);
    const arg = upsert.mock.calls[0][0] as unknown as { update: Record<string, unknown> };
    expect(arg.update.quality).toBe(4);
    // A blank field is omitted entirely (Prisma-undefined), never 0.
    expect(arg.update.punctuality).toBeUndefined();
    expect(arg.update.value).toBeUndefined();
  });

  it("rejects an out-of-range dimension with 400 and writes nothing", async () => {
    wireS2s({ interaction: "exists" });
    const res = await postReviewWith({ quality: "6" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid input");
    expect(upsert).not.toHaveBeenCalled();
  });
});

// Write-time content filter (#375): a denylist hit on the comment auto-files
// a SYSTEM report on the review; the write itself always succeeds (decision:
// auto-report and keep visible, never hard-block).
describe("POST /api/providers/:id/reviews — content filter (#375)", () => {
  it("auto-files a SYSTEM report on a denylist hit without blocking the write", async () => {
    wireS2s({ interaction: "exists" });
    const res = await postReviewWith({ comment: "This guy is a fucking scammer" });
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(reportCreate).toHaveBeenCalledWith({
      data: {
        targetType: "REVIEW",
        targetId: "rev_1",
        reporterId: null,
        reason: "auto-flag: content filter",
        details: expect.stringContaining('matched "fucking" in comment'),
        source: "SYSTEM",
      },
    });
  });

  it("flags Sinhala-script comments too", async () => {
    wireS2s({ interaction: "exists" });
    const res = await postReviewWith({ comment: "මූ පට්ට පකයා, එපා වෙලා ගියා" });
    expect(res.status).toBe(200);
    expect(reportCreate).toHaveBeenCalledTimes(1);
    const arg = reportCreate.mock.calls[0][0] as { data: { details: string } };
    expect(arg.data.details).toContain("පකයා");
  });

  it("refreshes the existing OPEN SYSTEM report instead of stacking duplicates", async () => {
    wireS2s({ interaction: "exists" });
    reportFindFirst.mockResolvedValueOnce({ id: "rep_existing" });
    const res = await postReviewWith({ comment: "still absolute bullshit work" });
    expect(res.status).toBe(200);
    expect(reportCreate).not.toHaveBeenCalled();
    expect(reportUpdate).toHaveBeenCalledWith({
      where: { id: "rep_existing" },
      data: { details: expect.stringContaining('matched "bullshit"') },
    });
  });

  it("leaves the reports table untouched for a clean comment", async () => {
    wireS2s({ interaction: "exists" });
    const res = await postReviewWith({ comment: "Excellent, punctual and tidy work." });
    expect(res.status).toBe(200);
    expect(reportFindFirst).not.toHaveBeenCalled();
    expect(reportCreate).not.toHaveBeenCalled();
  });

  it("never fails the write when the auto-report path throws (best-effort)", async () => {
    wireS2s({ interaction: "exists" });
    reportFindFirst.mockRejectedValueOnce(new Error("db down"));
    const res = await postReviewWith({ comment: "utter bullshit" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
