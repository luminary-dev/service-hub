// Route-level tests for the admin user-management PATCH handler, focused on the
// SUPPORT-role fix (#357): SUPPORT must be an assignable role, and any role
// change must bump sessionVersion so the new role takes effect immediately; and
// the session-revocation fix (#356): locking an account must bump
// sessionVersion too, so active sessions can't outlive the lock.
//
// Prisma and the provider-lookup S2S helper are mocked; the role gates read the
// x-user-* headers the gateway would forward.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { adminUsersRoutes } from "./admin-users";
import { ProviderAdminSuspendedError } from "../lib/providers";

const {
  db,
  logAudit,
  deactivateProviderProfile,
  reactivateProviderProfile,
  publishRevocation,
} = vi.hoisted(() => ({
  db: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  },
  logAudit: vi.fn(async () => {}),
  deactivateProviderProfile: vi.fn(async () => {}),
  reactivateProviderProfile: vi.fn(async () => true),
  publishRevocation: vi.fn(async () => {}),
}));

vi.mock("../db", () => ({ db }));
vi.mock("../lib/audit", () => ({ logAudit }));
vi.mock("../lib/log", () => ({ log: { error: vi.fn(), info: vi.fn() } }));
vi.mock("../lib/providers", () => ({
  // Stand-in for the real class: the route's instanceof (#550) and the test's
  // throw both resolve to this same mocked export.
  ProviderAdminSuspendedError: class ProviderAdminSuspendedError extends Error {},
  fetchProvidersByIds: vi.fn(async () => new Map()),
  deactivateProviderProfile,
  reactivateProviderProfile,
}));
vi.mock("../lib/revocation", () => ({ publishRevocation }));

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

describe("PATCH /api/admin/users/:id PROVIDER-boundary sync", () => {
  function rowWith(role: string) {
    return {
      id: "u2",
      email: "u@baas.lk",
      name: "User",
      phone: null,
      role,
      emailVerified: null,
      sessionVersion: 2,
      failedLogins: 0,
      lockedUntil: null,
      createdAt: new Date(),
    };
  }

  it("deactivates the provider profile on PROVIDER -> CUSTOMER", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u2", role: "PROVIDER" });
    db.user.update.mockResolvedValue(rowWith("CUSTOMER"));

    const res = await patch("u2", { role: "CUSTOMER" });
    expect(res.status).toBe(200);
    expect(deactivateProviderProfile).toHaveBeenCalledWith("u2");
    expect(reactivateProviderProfile).not.toHaveBeenCalled();
    expect(db.user.update).toHaveBeenCalled();
  });

  it("aborts with 502 and leaves the role unchanged if deactivate fails", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u2", role: "PROVIDER" });
    deactivateProviderProfile.mockRejectedValueOnce(new Error("down"));

    const res = await patch("u2", { role: "CUSTOMER" });
    expect(res.status).toBe(502);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("reactivates the provider profile on CUSTOMER -> PROVIDER", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u2", role: "CUSTOMER" });
    db.user.update.mockResolvedValue(rowWith("PROVIDER"));
    reactivateProviderProfile.mockResolvedValue(true);

    const res = await patch("u2", { role: "PROVIDER" });
    expect(res.status).toBe(200);
    expect(reactivateProviderProfile).toHaveBeenCalledWith("u2");
    expect(deactivateProviderProfile).not.toHaveBeenCalled();
    expect(db.user.update).toHaveBeenCalled();
  });

  it("aborts with 502 and leaves the role unchanged if reactivate fails", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u2", role: "CUSTOMER" });
    reactivateProviderProfile.mockRejectedValueOnce(new Error("down"));

    const res = await patch("u2", { role: "PROVIDER" });
    expect(res.status).toBe(502);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  // #550: a role change must not lift a moderation suspension as a side
  // effect — the promotion is refused until the profile is unsuspended.
  it("refuses the promotion with 409 when the profile is ADMIN-suspended", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u2", role: "CUSTOMER" });
    reactivateProviderProfile.mockRejectedValueOnce(
      new ProviderAdminSuspendedError()
    );

    const res = await patch("u2", { role: "PROVIDER" });
    expect(res.status).toBe(409);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("rejects promotion with 400 when the user has no provider profile (#554)", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u2", role: "CUSTOMER" });
    reactivateProviderProfile.mockResolvedValue(false);

    const res = await patch("u2", { role: "PROVIDER" });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/no provider profile/i);
    // The role must be left untouched: no update, no revocation, no audit row.
    expect(db.user.update).not.toHaveBeenCalled();
    expect(publishRevocation).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("makes NO provider call on CUSTOMER -> ADMIN (no PROVIDER involved)", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u2", role: "CUSTOMER" });
    db.user.update.mockResolvedValue(rowWith("ADMIN"));

    const res = await patch("u2", { role: "ADMIN" });
    expect(res.status).toBe(200);
    expect(deactivateProviderProfile).not.toHaveBeenCalled();
    expect(reactivateProviderProfile).not.toHaveBeenCalled();
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

  it("bumps sessionVersion on lock so active sessions are revoked (#356)", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u2", role: "CUSTOMER" });
    db.user.update.mockResolvedValue(updatedRow);

    const res = await patch("u2", { action: "lock" });
    expect(res.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u2" },
      data: expect.objectContaining({ sessionVersion: { increment: 1 } }),
    });
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

  it("does not bump sessionVersion on unlock", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u2", role: "CUSTOMER" });
    db.user.update.mockResolvedValue(updatedRow);

    const res = await patch("u2", { action: "unlock" });
    expect(res.status).toBe(200);
    const data = db.user.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("sessionVersion");
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

// The gateway can enforce a revocation without calling identity only if the new
// min-valid version reaches the shared Redis list — assert every bump publishes
// it, and that the no-bump paths don't (#374).
describe("Redis revocation-list publishing (#374)", () => {
  const row = (over: Record<string, unknown>) => ({
    id: "u2",
    email: "u@baas.lk",
    name: "User",
    phone: null,
    role: "CUSTOMER",
    emailVerified: null,
    sessionVersion: 1,
    failedLogins: 0,
    lockedUntil: null,
    createdAt: new Date(),
    ...over,
  });

  it("publishes the new version on a role change", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u2", role: "CUSTOMER" });
    db.user.update.mockResolvedValue(row({ role: "SUPPORT", sessionVersion: 2 }));
    await patch("u2", { role: "SUPPORT" });
    expect(publishRevocation).toHaveBeenCalledWith("u2", 2);
  });

  it("publishes the new version on a lock", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u2", role: "CUSTOMER" });
    db.user.update.mockResolvedValue(row({ sessionVersion: 4 }));
    await patch("u2", { action: "lock" });
    expect(publishRevocation).toHaveBeenCalledWith("u2", 4);
  });

  it("publishes the new version on a force-logout", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u2", role: "CUSTOMER" });
    db.user.update.mockResolvedValue({ id: "u2", sessionVersion: 3 });
    await forceLogout("u2");
    expect(publishRevocation).toHaveBeenCalledWith("u2", 3);
  });

  it("does NOT publish on an unlock (no bump)", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u2", role: "CUSTOMER" });
    db.user.update.mockResolvedValue(row({ sessionVersion: 1 }));
    await patch("u2", { action: "unlock" });
    expect(publishRevocation).not.toHaveBeenCalled();
  });

  it("does NOT publish when the role is unchanged (no bump)", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u2", role: "SUPPORT" });
    db.user.update.mockResolvedValue(row({ role: "SUPPORT", sessionVersion: 1 }));
    await patch("u2", { role: "SUPPORT" });
    expect(publishRevocation).not.toHaveBeenCalled();
  });
});

// #753: `page` feeds `skip = (page - 1) * PAGE_SIZE`, so it must be clamped to
// MAX_PAGE (500) — otherwise a huge `?page=` overflows the 64-bit skip Prisma
// rejects with a 500 and forces a full-match-set scan.
describe("GET /api/admin/users pagination cap (#753)", () => {
  beforeEach(() => {
    db.user.findMany.mockResolvedValue([]);
    db.user.count.mockResolvedValue(0);
  });

  function listPage(page: string) {
    return app.request(`/api/admin/users?page=${page}`, {
      headers: {
        "x-user-id": "admin1",
        "x-user-role": "ADMIN",
        "x-user-name": "Admin",
      },
    });
  }

  it("passes a normal page straight through", async () => {
    const res = await listPage("3");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ page: 3 });
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 2 * 20, take: 20 })
    );
  });

  it("clamps an oversized page to 500 so skip stays int-safe", async () => {
    const res = await listPage("1e300");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ page: 500 });
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 499 * 20, take: 20 })
    );
  });
});
