// Route-level tests for admin impersonation, focused on the email-fallback
// lookup (L3 security fix): stored emails are always lowercased, so a
// mixed-case address typed by the admin must be normalized before the lookup —
// otherwise "Foo@Bar.com" spuriously 404s an existing user.
//
// Prisma, the session helpers, and the provider-lookup S2S helper are mocked;
// the role gates read the x-user-* headers the gateway would forward.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { adminImpersonationRoutes } from "./admin-impersonation";

const { db, createImpersonationSession, getProviderIdByUser } = vi.hoisted(
  () => ({
    db: {
      user: { findUnique: vi.fn() },
      impersonationLog: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    },
    createImpersonationSession: vi.fn(async () => {}),
    getProviderIdByUser: vi.fn(async () => null),
  })
);

vi.mock("../db", () => ({ db }));
vi.mock("../lib/log", () => ({ log: { error: vi.fn(), info: vi.fn() } }));
vi.mock("../lib/session", () => ({
  createImpersonationSession,
  destroyImpersonationSession: vi.fn(),
  readImpersonationSession: vi.fn(async () => null),
}));
vi.mock("../lib/providers", () => ({ getProviderIdByUser }));

const app = new Hono();
app.route("/api/admin/impersonate", adminImpersonationRoutes);

const ADMIN_HEADERS = {
  "content-type": "application/json",
  "x-user-id": "admin1",
  "x-user-role": "ADMIN",
  "x-user-name": "Admin",
};

function impersonate(userId: string, headers = ADMIN_HEADERS) {
  return app.request(`/api/admin/impersonate/${encodeURIComponent(userId)}`, {
    method: "POST",
    headers,
  });
}

const TARGET = {
  id: "cltarget00000000000000000",
  email: "foo@bar.com",
  name: "Foo",
  role: "CUSTOMER",
  sessionVersion: 1,
};

beforeEach(() => {
  vi.resetAllMocks();
  getProviderIdByUser.mockResolvedValue(null);
  createImpersonationSession.mockResolvedValue(undefined);
});

describe("POST /api/admin/impersonate/:userId email normalization", () => {
  it("resolves a mixed-case email to the lowercase-stored user and starts impersonation", async () => {
    // id lookup misses; the email lookup only hits when normalized to lowercase.
    db.user.findUnique.mockImplementation(async ({ where }) => {
      if (where.email === "foo@bar.com") return TARGET;
      if (where.id === "admin1") return { sessionVersion: 1 };
      return null;
    });

    const res = await impersonate("Foo@Bar.com");
    expect(res.status).toBe(200);

    // The email lookup must have been made with the normalized value.
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { email: "foo@bar.com" },
    });
    expect(createImpersonationSession).toHaveBeenCalledTimes(1);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.user.id).toBe(TARGET.id);
  });

  it("trims surrounding whitespace before the email lookup", async () => {
    db.user.findUnique.mockImplementation(async ({ where }) => {
      if (where.email === "foo@bar.com") return TARGET;
      if (where.id === "admin1") return { sessionVersion: 1 };
      return null;
    });

    const res = await impersonate("  Foo@Bar.com  ");
    expect(res.status).toBe(200);
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { email: "foo@bar.com" },
    });
  });

  it("404s when no user matches even after normalization", async () => {
    db.user.findUnique.mockResolvedValue(null);

    const res = await impersonate("Missing@Bar.com");
    expect(res.status).toBe(404);
    expect(createImpersonationSession).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/impersonate/:userId admin-tier guard (#654)", () => {
  it("refuses to impersonate an ADMIN target", async () => {
    db.user.findUnique.mockResolvedValue({ ...TARGET, role: "ADMIN" });

    const res = await impersonate(TARGET.id);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Cannot impersonate an admin account",
    });
    expect(createImpersonationSession).not.toHaveBeenCalled();
  });

  it("refuses to impersonate a SUPPORT target (still admin-tier)", async () => {
    db.user.findUnique.mockResolvedValue({ ...TARGET, role: "SUPPORT" });

    const res = await impersonate(TARGET.id);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Cannot impersonate an admin account",
    });
    expect(createImpersonationSession).not.toHaveBeenCalled();
  });
});
