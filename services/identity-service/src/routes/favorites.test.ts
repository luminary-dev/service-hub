// Route tests for the favorites CRUD. Prisma is mocked; the provider-existence
// S2S check (lib/providers.providerExists) is stubbed per path. The POST path
// caps a user's favorites (#647 L5): the existence check + count + insert run
// inside one transaction under a per-user advisory lock, so tx === db and the
// route's tx.* calls resolve to the same mocked methods.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { favoritesRoutes, MAX_FAVORITES } from "./favorites";
import { providerExists } from "../lib/providers";

const { db } = vi.hoisted(() => ({
  db: {
    favorite: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    $executeRaw: vi.fn(async () => 0),
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  },
}));

vi.mock("../db", () => ({ db }));
vi.mock("../lib/providers", () => ({ providerExists: vi.fn() }));

const exists = vi.mocked(providerExists);

const app = new Hono();
app.route("/api/favorites", favoritesRoutes);

const AUTH = {
  "content-type": "application/json",
  "x-user-id": "u1",
  "x-user-role": "CUSTOMER",
  "x-user-name": "Dilani",
};

function req(method: string, path: string, headers: Record<string, string> = AUTH) {
  return app.request(path, { method, headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  exists.mockResolvedValue(true);
  db.favorite.findUnique.mockResolvedValue(null);
  db.favorite.count.mockResolvedValue(0);
});

describe("GET /api/favorites", () => {
  it("returns the caller's favorited ids newest first", async () => {
    db.favorite.findMany.mockResolvedValue([{ providerId: "p2" }, { providerId: "p1" }]);
    const res = await req("GET", "/api/favorites");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ providerIds: ["p2", "p1"] });
  });

  it("requires auth", async () => {
    const res = await req("GET", "/api/favorites", {});
    expect(res.status).toBe(401);
  });
});

describe("POST /api/favorites/:id", () => {
  it("requires auth", async () => {
    const res = await req("POST", "/api/favorites/p1", {});
    expect(res.status).toBe(401);
  });

  it("404s when the provider does not exist", async () => {
    exists.mockResolvedValue(false);
    const res = await req("POST", "/api/favorites/p1");
    expect(res.status).toBe(404);
    expect(db.favorite.create).not.toHaveBeenCalled();
  });

  it("502s when the existence check fails", async () => {
    exists.mockRejectedValue(new Error("provider-service down"));
    const res = await req("POST", "/api/favorites/p1");
    expect(res.status).toBe(502);
    expect(db.favorite.create).not.toHaveBeenCalled();
  });

  it("creates a new favorite under a per-user advisory lock", async () => {
    db.favorite.create.mockResolvedValue({ id: "f1" });
    const res = await req("POST", "/api/favorites/p1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ favorited: true });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    expect(db.favorite.create).toHaveBeenCalledWith({
      data: { userId: "u1", providerId: "p1" },
    });
  });

  it("is idempotent for an already-favorited provider (no new row, never capped)", async () => {
    // At the cap, but re-favoriting an existing row must still succeed.
    db.favorite.findUnique.mockResolvedValue({ id: "f1" });
    db.favorite.count.mockResolvedValue(MAX_FAVORITES);
    const res = await req("POST", "/api/favorites/p1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ favorited: true });
    expect(db.favorite.count).not.toHaveBeenCalled();
    expect(db.favorite.create).not.toHaveBeenCalled();
  });

  it("429s a NEW favorite once the per-user cap is reached (#647 L5)", async () => {
    db.favorite.findUnique.mockResolvedValue(null);
    db.favorite.count.mockResolvedValue(MAX_FAVORITES);
    const res = await req("POST", "/api/favorites/p1");
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/favorites limit reached/i);
    expect(db.favorite.create).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/favorites/:id", () => {
  it("removes only the caller's row and is idempotent", async () => {
    db.favorite.deleteMany.mockResolvedValue({ count: 1 });
    const res = await req("DELETE", "/api/favorites/p1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ favorited: false });
    expect(db.favorite.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", providerId: "p1" },
    });
  });

  it("requires auth", async () => {
    const res = await req("DELETE", "/api/favorites/p1", {});
    expect(res.status).toBe(401);
  });
});
