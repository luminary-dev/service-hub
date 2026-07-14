// #634: logAudit must attribute an action taken from an impersonation session
// to the REAL admin (x-impersonated-by), not the impersonated target that the
// gateway forwards as x-user-id.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { logAudit } from "./audit";

const { db } = vi.hoisted(() => ({
  db: { adminAuditLog: { create: vi.fn() } },
}));
vi.mock("../db", () => ({ db }));

// A minimal app whose single route invokes logAudit, so the real forwarded
// identity headers (x-user-id / x-impersonated-by) drive the call.
const app = new Hono();
app.post("/log", async (c) => {
  await logAudit(c, "LEAVE_PROVIDER", "USER", "target-1");
  return c.json({ ok: true });
});

beforeEach(() => {
  vi.resetAllMocks();
  db.adminAuditLog.create.mockResolvedValue({});
});

describe("logAudit", () => {
  it("records impersonatedBy null for an ordinary action", async () => {
    await app.request("/log", { method: "POST", headers: { "x-user-id": "u-1" } });
    expect(db.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ adminId: "u-1", impersonatedBy: null }),
    });
  });

  it("captures the real admin from x-impersonated-by under impersonation", async () => {
    await app.request("/log", {
      method: "POST",
      headers: { "x-user-id": "target-1", "x-impersonated-by": "admin-1" },
    });
    expect(db.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminId: "target-1",
        impersonatedBy: "admin-1",
      }),
    });
  });

  it("does nothing without an identity", async () => {
    await app.request("/log", { method: "POST" });
    expect(db.adminAuditLog.create).not.toHaveBeenCalled();
  });
});
