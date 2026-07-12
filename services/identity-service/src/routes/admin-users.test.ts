// Route-level tests for the admin user-management PATCH handler, focused on the
// SUPPORT-role fix (#357): SUPPORT must be an assignable role, and any role
// change must bump sessionVersion so the new role takes effect immediately.
//
// Prisma and the provider-lookup S2S helper are mocked; the role gates read the
// x-user-* headers the gateway would forward.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { adminUsersRoutes } from "./admin-users";

const { db } = vi.hoisted(() => ({
  db: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../db", () => ({ db }));
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
