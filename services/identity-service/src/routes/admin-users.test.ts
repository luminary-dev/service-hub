// Route-level tests for the admin user-management PATCH handler, focused on the
// SUPPORT-role fix (#357): SUPPORT must be an assignable role, and any role
// change must bump sessionVersion so the new role takes effect immediately.
//
// Prisma and the provider-lookup S2S helper are mocked; the role gates read the
// x-user-* headers the gateway would forward.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { adminUsersRoutes } from "./admin-users";

const { db, logAudit } = vi.hoisted(() => ({
  db: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  },
  logAudit: vi.fn(async () => {}),
}));

vi.mock("../db", () => ({ db }));
vi.mock("../lib/audit", () => ({ logAudit }));
vi.mock("../lib/providers", () => ({
  fetchProvidersByIds: vi.fn(async () => new Map()),
}));

const app = new Hono();
app.route("/", adminUsersRoutes);

const ADMIN_HEADERS = {
  "content-type": "application/json",
  "x-user-id": "admin1",
  "x-user-role": "ADMIN",
  "x-user-name": "Admin",
};

function patch(id: string, body: unknown, headers = ADMIN_HEADERS) {
  return app.request(`/api/admin/users/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
}

function forceLogout(id: string, headers = ADMIN_HEADERS) {
  return app.request(`/api/admin/users/${id}/force-logout`, {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("PATCH /api/admin/users/:id role change", () => {
  it("accepts SUPPORT as a target role and bumps sessionVersion", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u2", role: "CUSTOMER" });
    db.user.update.mockResolvedValue({
      id: "u2",
      email: "s@baas.lk",
      name: "Sup",
      phone: null,
      role: "SUPPORT",
      emailVerified: null,
      sessionVersion: 2,
      failedLogins: 0,
      lockedUntil: null,
      createdAt: new Date(),
    });

    const res = await patch("u2", { role: "SUPPORT" });
    expect(res.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u2" },
      data: { role: "SUPPORT", sessionVersion: { increment: 1 } },
    });
    const json = await res.json();
    expect(json.user.role).toBe("SUPPORT");
  });

  it("audits the role change with old -> new role", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u2", role: "CUSTOMER" });
    db.user.update.mockResolvedValue({
      id: "u2",
      email: "s@baas.lk",
      name: "Sup",
      phone: null,
      role: "SUPPORT",
      emailVerified: null,
      sessionVersion: 2,
      failedLogins: 0,
      lockedUntil: null,
      createdAt: new Date(),
    });

    await patch("u2", { role: "SUPPORT" });
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      "CHANGE_ROLE",
      "USER",
      "u2",
      "CUSTOMER -> SUPPORT"
    );
  });

  it("does not audit a role change when the role is unchanged", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u2", role: "SUPPORT" });
    db.user.update.mockResolvedValue({
      id: "u2",
      email: "s@baas.lk",
      name: "Sup",
      phone: null,
      role: "SUPPORT",
      emailVerified: null,
      sessionVersion: 1,
      failedLogins: 0,
      lockedUntil: null,
      createdAt: new Date(),
    });

    await patch("u2", { role: "SUPPORT" });
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("does not bump sessionVersion when the role is unchanged", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u2", role: "SUPPORT" });
    db.user.update.mockResolvedValue({
      id: "u2",
      email: "s@baas.lk",
      name: "Sup",
      phone: null,
      role: "SUPPORT",
      emailVerified: null,
      sessionVersion: 1,
      failedLogins: 0,
      lockedUntil: null,
      createdAt: new Date(),
    });

    await patch("u2", { role: "SUPPORT" });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u2" },
      data: {},
    });
  });

  it("rejects an unknown role", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u2", role: "CUSTOMER" });
    const res = await patch("u2", { role: "WIZARD" });
    expect(res.status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/users/:id lock/unlock", () => {
  const updatedRow = {
    id: "u2",
    email: "c@baas.lk",
    name: "Cust",
    phone: null,
    role: "CUSTOMER",
    emailVerified: null,
    sessionVersion: 1,
    failedLogins: 0,
    lockedUntil: null,
    createdAt: new Date(),
  };

  it("audits a lock", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u2", role: "CUSTOMER" });
    db.user.update.mockResolvedValue(updatedRow);

    const res = await patch("u2", { action: "lock" });
    expect(res.status).toBe(200);
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      "LOCK_USER",
      "USER",
      "u2"
    );
  });

  it("audits an unlock", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u2", role: "CUSTOMER" });
    db.user.update.mockResolvedValue(updatedRow);

    const res = await patch("u2", { action: "unlock" });
    expect(res.status).toBe(200);
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      "UNLOCK_USER",
      "USER",
      "u2"
    );
  });
});

describe("POST /api/admin/users/:id/force-logout", () => {
  it("audits a force-logout", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u2", role: "CUSTOMER" });
    db.user.update.mockResolvedValue({ id: "u2", sessionVersion: 3 });

    const res = await forceLogout("u2");
    expect(res.status).toBe(200);
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      "FORCE_LOGOUT",
      "USER",
      "u2"
    );
  });

  it("does not audit when forcing logout on your own account", async () => {
    const res = await forceLogout("admin1");
    expect(res.status).toBe(400);
    expect(logAudit).not.toHaveBeenCalled();
  });
});
