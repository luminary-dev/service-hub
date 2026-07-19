// Route tests for the public notification-center endpoints: the auth gates
// (401 without identity headers), owner scoping on every query, pagination
// clamps + cursor, mark-read idempotency, the preference matrix merge, and
// the push device-token registry (#798). Prisma is mocked — no live DB.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    $queryRaw: vi.fn(),
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    notificationPreference: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    deviceToken: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));
vi.mock("../db", () => ({ db: dbMock }));

import { app } from "../app";
import {
  DEFAULT_FEED_TAKE,
  MAX_DEVICE_TOKENS,
  MAX_FEED_TAKE,
  normalizeTake,
} from "./notifications";

const SECRET = "dev-internal-secret";
const USER = "user_a";

function req(path: string, init: RequestInit = {}, headers: Record<string, string> = {}) {
  return app.request(path, {
    ...init,
    headers: { "x-internal-secret": SECRET, ...headers, ...(init.headers as object) },
  });
}

function asUser(path: string, init: RequestInit = {}) {
  return req(path, init, { "x-user-id": USER });
}

function row(id: string, createdAt = new Date("2026-07-01T00:00:00Z")) {
  return {
    id,
    userId: USER,
    type: "NEW_INQUIRY",
    payload: { customerName: "Dilani" },
    link: "/dashboard",
    readAt: null,
    createdAt,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.notification.findMany.mockResolvedValue([]);
  dbMock.notification.count.mockResolvedValue(0);
  dbMock.notification.updateMany.mockResolvedValue({ count: 0 });
  dbMock.notificationPreference.findMany.mockResolvedValue([]);
  dbMock.deviceToken.upsert.mockResolvedValue({});
  dbMock.deviceToken.findMany.mockResolvedValue([]);
  dbMock.deviceToken.deleteMany.mockResolvedValue({ count: 0 });
});

describe("normalizeTake", () => {
  it("clamps to the default and the ceiling", () => {
    expect(normalizeTake(undefined)).toBe(DEFAULT_FEED_TAKE);
    expect(normalizeTake("abc")).toBe(DEFAULT_FEED_TAKE);
    expect(normalizeTake("0")).toBe(DEFAULT_FEED_TAKE);
    expect(normalizeTake("-3")).toBe(DEFAULT_FEED_TAKE);
    expect(normalizeTake("10")).toBe(10);
    expect(normalizeTake("999")).toBe(MAX_FEED_TAKE);
  });
});

describe("GET /api/notifications", () => {
  it("401s without a session", async () => {
    const res = await req("/api/notifications");
    expect(res.status).toBe(401);
  });

  it("serves the caller's feed newest-first with a nextCursor", async () => {
    // take=2 → the route fetches 3; a full extra row signals another page.
    dbMock.notification.findMany.mockResolvedValue([row("n3"), row("n2"), row("n1")]);
    const res = await asUser("/api/notifications?take=2");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notifications.map((n: { id: string }) => n.id)).toEqual(["n3", "n2"]);
    expect(body.nextCursor).toBe("n2");

    expect(dbMock.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 3,
      })
    );
  });

  it("passes the cursor through and returns null nextCursor on the last page", async () => {
    dbMock.notification.findMany.mockResolvedValue([row("n1")]);
    const res = await asUser("/api/notifications?take=2&cursor=n2");
    expect(res.status).toBe(200);
    expect((await res.json()).nextCursor).toBeNull();
    expect(dbMock.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: "n2" }, skip: 1 })
    );
  });
});

describe("GET /api/notifications/unread-count", () => {
  it("401s without a session", async () => {
    expect((await req("/api/notifications/unread-count")).status).toBe(401);
  });

  it("counts only the caller's unread rows", async () => {
    dbMock.notification.count.mockResolvedValue(4);
    const res = await asUser("/api/notifications/unread-count");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 4 });
    expect(dbMock.notification.count).toHaveBeenCalledWith({
      where: { userId: USER, readAt: null },
    });
  });
});

describe("POST /api/notifications/read", () => {
  it("401s without a session", async () => {
    const res = await req("/api/notifications/read", {
      method: "POST",
      body: JSON.stringify({ all: true }),
    });
    expect(res.status).toBe(401);
  });

  it("400s without ids or all (and on bad shapes)", async () => {
    expect(
      (await asUser("/api/notifications/read", { method: "POST", body: "{}" })).status
    ).toBe(400);
    expect(
      (
        await asUser("/api/notifications/read", {
          method: "POST",
          body: JSON.stringify({ ids: [] }),
        })
      ).status
    ).toBe(400);
    expect(
      (
        await asUser("/api/notifications/read", {
          method: "POST",
          body: JSON.stringify({ all: false }),
        })
      ).status
    ).toBe(400);
  });

  it("marks the given ids read, scoped to the caller's own unread rows", async () => {
    dbMock.notification.updateMany.mockResolvedValue({ count: 2 });
    const res = await asUser("/api/notifications/read", {
      method: "POST",
      body: JSON.stringify({ ids: ["n1", "n2", "someone_elses"] }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, updated: 2 });
    const args = dbMock.notification.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({
      userId: USER,
      readAt: null,
      id: { in: ["n1", "n2", "someone_elses"] },
    });
    expect(args.data.readAt).toBeInstanceOf(Date);
  });

  it("marks everything read with { all: true } (idempotent)", async () => {
    dbMock.notification.updateMany.mockResolvedValue({ count: 0 });
    const res = await asUser("/api/notifications/read", {
      method: "POST",
      body: JSON.stringify({ all: true }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, updated: 0 });
    expect(dbMock.notification.updateMany.mock.calls[0][0].where).toEqual({
      userId: USER,
      readAt: null,
    });
  });
});

describe("POST /api/notifications/devices", () => {
  const body = JSON.stringify({ token: "fcm_tok_1", platform: "android" });

  it("401s without a session", async () => {
    const res = await req("/api/notifications/devices", { method: "POST", body });
    expect(res.status).toBe(401);
    expect(dbMock.deviceToken.upsert).not.toHaveBeenCalled();
  });

  it("400s on a missing token, an unknown platform, or an oversized token", async () => {
    for (const bad of [
      {},
      { token: "t" }, // no platform
      { token: "t", platform: "web" },
      { token: "", platform: "ios" },
      { token: "x".repeat(4097), platform: "ios" },
    ]) {
      const res = await asUser("/api/notifications/devices", {
        method: "POST",
        body: JSON.stringify(bad),
      });
      expect(res.status).toBe(400);
    }
    expect(dbMock.deviceToken.upsert).not.toHaveBeenCalled();
  });

  it("upserts by token so a device that switches accounts moves to the caller", async () => {
    const res = await asUser("/api/notifications/devices", { method: "POST", body });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(dbMock.deviceToken.upsert).toHaveBeenCalledWith({
      where: { token: "fcm_tok_1" },
      create: { userId: USER, token: "fcm_tok_1", platform: "android" },
      update: { userId: USER, platform: "android" },
    });
  });

  it("evicts the stalest rows beyond the per-user cap instead of erroring", async () => {
    dbMock.deviceToken.findMany.mockResolvedValue([{ id: "d_old1" }, { id: "d_old2" }]);
    const res = await asUser("/api/notifications/devices", { method: "POST", body });
    expect(res.status).toBe(200);
    // The eviction query skips the newest MAX_DEVICE_TOKENS rows…
    expect(dbMock.deviceToken.findMany).toHaveBeenCalledWith({
      where: { userId: USER },
      orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
      skip: MAX_DEVICE_TOKENS,
      select: { id: true },
    });
    // …and deletes whatever fell past the window.
    expect(dbMock.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["d_old1", "d_old2"] } },
    });
  });

  it("skips the delete entirely when the caller is under the cap", async () => {
    const res = await asUser("/api/notifications/devices", { method: "POST", body });
    expect(res.status).toBe(200);
    expect(dbMock.deviceToken.deleteMany).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/notifications/devices", () => {
  const body = JSON.stringify({ token: "fcm_tok_1" });

  it("401s without a session", async () => {
    const res = await req("/api/notifications/devices", { method: "DELETE", body });
    expect(res.status).toBe(401);
  });

  it("400s without a token", async () => {
    const res = await asUser("/api/notifications/devices", {
      method: "DELETE",
      body: "{}",
    });
    expect(res.status).toBe(400);
    expect(dbMock.deviceToken.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes the caller's own row only, idempotent on unknown/foreign tokens", async () => {
    const res = await asUser("/api/notifications/devices", { method: "DELETE", body });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(dbMock.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: { token: "fcm_tok_1", userId: USER },
    });
  });
});

describe("GET /api/notification-preferences", () => {
  it("401s without a session", async () => {
    expect((await req("/api/notification-preferences")).status).toBe(401);
  });

  it("returns the full matrix with defaults merged over stored overrides", async () => {
    dbMock.notificationPreference.findMany.mockResolvedValue([
      { userId: USER, type: "NEW_REVIEW", emailEnabled: false, inAppEnabled: true },
    ]);
    const res = await asUser("/api/notification-preferences");
    expect(res.status).toBe(200);
    const { preferences } = await res.json();
    expect(preferences).toHaveLength(10); // every catalog type, no row needed
    const newReview = preferences.find((p: { type: string }) => p.type === "NEW_REVIEW");
    expect(newReview).toEqual({ type: "NEW_REVIEW", emailEnabled: false, inAppEnabled: true });
    const untouched = preferences.find((p: { type: string }) => p.type === "NEW_INQUIRY");
    expect(untouched).toEqual({ type: "NEW_INQUIRY", emailEnabled: true, inAppEnabled: true });
  });
});

describe("POST /api/notification-preferences", () => {
  it("401s without a session", async () => {
    const res = await req("/api/notification-preferences", {
      method: "POST",
      body: JSON.stringify({ type: "NEW_REVIEW", emailEnabled: false }),
    });
    expect(res.status).toBe(401);
  });

  it("400s on an unknown type or when no channel flag is given", async () => {
    expect(
      (
        await asUser("/api/notification-preferences", {
          method: "POST",
          body: JSON.stringify({ type: "NOT_A_TYPE", emailEnabled: false }),
        })
      ).status
    ).toBe(400);
    expect(
      (
        await asUser("/api/notification-preferences", {
          method: "POST",
          body: JSON.stringify({ type: "NEW_REVIEW" }),
        })
      ).status
    ).toBe(400);
    expect(dbMock.notificationPreference.upsert).not.toHaveBeenCalled();
  });

  it("upserts the caller's override and echoes the stored row", async () => {
    dbMock.notificationPreference.upsert.mockResolvedValue({
      id: "p1",
      userId: USER,
      type: "NEW_REVIEW",
      emailEnabled: false,
      inAppEnabled: true,
    });
    const res = await asUser("/api/notification-preferences", {
      method: "POST",
      body: JSON.stringify({ type: "NEW_REVIEW", emailEnabled: false }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      preference: { type: "NEW_REVIEW", emailEnabled: false, inAppEnabled: true },
    });
    // Only the provided flag is written; the other keeps its stored/default value.
    expect(dbMock.notificationPreference.upsert).toHaveBeenCalledWith({
      where: { userId_type: { userId: USER, type: "NEW_REVIEW" } },
      create: { userId: USER, type: "NEW_REVIEW", emailEnabled: false },
      update: { emailEnabled: false },
    });
  });
});
