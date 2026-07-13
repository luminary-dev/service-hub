// Tests for the internal saved-search endpoints (#516) behind provider-
// service's new-match fan-out: candidate scoping and cooldown bookkeeping.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { internalSavedSearchesRoutes } from "./internal-saved-searches";

const { db } = vi.hoisted(() => ({
  db: {
    savedSearch: { findMany: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock("../db", () => ({ db }));

const app = new Hono();
app.route("/internal/saved-searches", internalSavedSearchesRoutes);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /internal/saved-searches/candidates", () => {
  it("requires category and district", async () => {
    const res = await app.request(
      "/internal/saved-searches/candidates?category=electrician"
    );
    expect(res.status).toBe(400);
  });

  it("scopes by category/district (null = any), cooldown, role and verified email", async () => {
    db.savedSearch.findMany.mockResolvedValue([
      { id: "s1", query: "wiring", locale: "si", user: { email: "a@b.lk" } },
    ]);

    const res = await app.request(
      "/internal/saved-searches/candidates?category=electrician&district=Colombo&excludeUserId=u9"
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      savedSearches: [{ id: "s1", query: "wiring", locale: "si", email: "a@b.lk" }],
    });

    const where = db.savedSearch.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ category: null }, { category: "electrician" }]);
    expect(where.AND[0]).toEqual({
      OR: [{ district: null }, { district: "Colombo" }],
    });
    expect(where.AND[1].OR[0]).toEqual({ lastNotifiedAt: null });
    expect(where.NOT).toEqual({ userId: "u9" });
    expect(where.user).toEqual({
      role: "CUSTOMER",
      emailVerified: { not: null },
    });
  });
});

describe("POST /internal/saved-searches/notified", () => {
  it("stamps lastNotifiedAt for the given ids", async () => {
    db.savedSearch.updateMany.mockResolvedValue({ count: 2 });

    const res = await app.request("/internal/saved-searches/notified", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["s1", "s2"] }),
    });
    expect(res.status).toBe(200);
    expect(db.savedSearch.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["s1", "s2"] } },
      data: { lastNotifiedAt: expect.any(Date) },
    });
  });

  it("rejects an empty/invalid body", async () => {
    const res = await app.request("/internal/saved-searches/notified", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [] }),
    });
    expect(res.status).toBe(400);
    expect(db.savedSearch.updateMany).not.toHaveBeenCalled();
  });
});
