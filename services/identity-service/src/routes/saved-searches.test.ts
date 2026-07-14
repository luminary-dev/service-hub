// Route tests for the saved-search CRUD (#516). Prisma and the category
// validator are mocked; district validation runs against the real constant.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { savedSearchesRoutes, MAX_SAVED_SEARCHES } from "./saved-searches";
import { categoryValidator } from "../lib/categories";

const { db } = vi.hoisted(() => ({
  db: {
    savedSearch: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    // The dup-check + cap + insert run inside an interactive transaction
    // guarded by a per-user advisory lock (#647 L5). tx === db here, so the
    // route's tx.* calls resolve to the same mocked methods; $executeRaw is
    // the advisory-lock acquisition.
    $executeRaw: vi.fn(async () => 0),
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  },
}));

vi.mock("../db", () => ({ db }));
vi.mock("../lib/categories", () => ({
  categoryValidator: { isValidCategory: vi.fn() },
}));

const isValidCategory = vi.mocked(categoryValidator.isValidCategory);

const app = new Hono();
app.route("/api/saved-searches", savedSearchesRoutes);

const AUTH = {
  "content-type": "application/json",
  "x-user-id": "u1",
  "x-user-role": "CUSTOMER",
  "x-user-name": "Dilani",
};

function req(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = AUTH
) {
  return app.request(path, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  isValidCategory.mockResolvedValue(true);
});

describe("GET /api/saved-searches", () => {
  it("returns the caller's searches newest first", async () => {
    const rows = [{ id: "s1", name: "Electricians", query: null, category: "electrician", district: null, createdAt: new Date() }];
    db.savedSearch.findMany.mockResolvedValue(rows);

    const res = await req("GET", "/api/saved-searches");
    expect(res.status).toBe(200);
    expect(db.savedSearch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1" },
        orderBy: { createdAt: "desc" },
      })
    );
    const data = (await res.json()) as { savedSearches: { id: string }[] };
    expect(data.savedSearches[0]?.id).toBe("s1");
  });

  it("requires auth", async () => {
    const res = await req("GET", "/api/saved-searches", undefined, {});
    expect(res.status).toBe(401);
  });

  it("is customer-only", async () => {
    const res = await req("GET", "/api/saved-searches", undefined, {
      ...AUTH,
      "x-user-role": "PROVIDER",
    });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/saved-searches", () => {
  const valid = {
    name: "Colombo electricians",
    query: "wiring",
    category: "electrician",
    district: "Colombo",
  };

  it("creates a search with the caller's locale", async () => {
    db.savedSearch.findFirst.mockResolvedValue(null);
    db.savedSearch.count.mockResolvedValue(0);
    db.savedSearch.create.mockResolvedValue({ id: "s1", ...valid, createdAt: new Date() });

    const res = await req("POST", "/api/saved-searches", valid, {
      ...AUTH,
      "x-locale": "si",
    });
    expect(res.status).toBe(201);
    expect(db.savedSearch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          userId: "u1",
          name: valid.name,
          query: "wiring",
          category: "electrician",
          district: "Colombo",
          locale: "si",
        },
      })
    );
  });

  it("normalizes empty-string filters to null", async () => {
    db.savedSearch.findFirst.mockResolvedValue(null);
    db.savedSearch.count.mockResolvedValue(0);
    db.savedSearch.create.mockResolvedValue({ id: "s1" });

    const res = await req("POST", "/api/saved-searches", {
      name: "Plumbers anywhere",
      query: "",
      category: "plumber",
      district: "",
    });
    expect(res.status).toBe(201);
    expect(db.savedSearch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ query: null, district: null }),
      })
    );
  });

  it("rejects a search with no filters", async () => {
    const res = await req("POST", "/api/saved-searches", {
      name: "Everything",
      query: " ",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "At least one filter is required" });
  });

  it("rejects an unknown category", async () => {
    isValidCategory.mockResolvedValue(false);
    const res = await req("POST", "/api/saved-searches", valid);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid category" });
  });

  it("rejects an unknown district", async () => {
    const res = await req("POST", "/api/saved-searches", {
      ...valid,
      district: "Atlantis",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid district" });
  });

  it("returns the existing row for duplicate filters without burning a slot", async () => {
    const existing = { id: "s9", name: "Old name", query: "wiring", category: "electrician", district: "Colombo", createdAt: new Date() };
    db.savedSearch.findFirst.mockResolvedValue(existing);

    const res = await req("POST", "/api/saved-searches", valid);
    expect(res.status).toBe(200);
    expect(db.savedSearch.create).not.toHaveBeenCalled();
    const data = (await res.json()) as { savedSearch: { id: string } };
    expect(data.savedSearch.id).toBe("s9");
  });

  it("enforces the per-user cap", async () => {
    db.savedSearch.findFirst.mockResolvedValue(null);
    db.savedSearch.count.mockResolvedValue(MAX_SAVED_SEARCHES);

    const res = await req("POST", "/api/saved-searches", valid);
    expect(res.status).toBe(429);
    expect(db.savedSearch.create).not.toHaveBeenCalled();
  });

  it("runs the dup-check + cap + insert under a per-user advisory lock (#647 L5)", async () => {
    db.savedSearch.findFirst.mockResolvedValue(null);
    db.savedSearch.count.mockResolvedValue(0);
    db.savedSearch.create.mockResolvedValue({ id: "s1", ...valid, createdAt: new Date() });

    const res = await req("POST", "/api/saved-searches", valid);
    expect(res.status).toBe(201);
    // The whole check-then-act is wrapped in one transaction, and the advisory
    // lock is acquired inside it so concurrent submits serialize.
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid bodies", async () => {
    const res = await req("POST", "/api/saved-searches", { name: "" });
    expect(res.status).toBe(400);
  });

  it("is customer-only", async () => {
    const res = await req("POST", "/api/saved-searches", valid, {
      ...AUTH,
      "x-user-role": "ADMIN",
    });
    expect(res.status).toBe(403);
    expect(db.savedSearch.create).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/saved-searches/:id", () => {
  it("deletes only the caller's row", async () => {
    db.savedSearch.deleteMany.mockResolvedValue({ count: 1 });

    const res = await req("DELETE", "/api/saved-searches/s1");
    expect(res.status).toBe(200);
    expect(db.savedSearch.deleteMany).toHaveBeenCalledWith({
      where: { id: "s1", userId: "u1" },
    });
    expect(await res.json()).toEqual({ deleted: true });
  });

  it("requires auth", async () => {
    const res = await req("DELETE", "/api/saved-searches/s1", undefined, {});
    expect(res.status).toBe(401);
  });
});
