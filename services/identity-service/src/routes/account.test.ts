// Route tests for the account self-service handlers (#396): profile edit
// (name/phone + session-name refresh) and the change-email request/confirm
// lifecycle. Prisma and the change-email sender are mocked; createSession runs
// for real (signs a JWT with the dev secret + sets the cookie).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { accountRoutes } from "./account";
import { hashToken } from "../lib/tokens";
import { sendEmailChangeConfirmation } from "../lib/verification";

const { db } = vi.hoisted(() => ({
  db: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    emailChangeToken: {
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../db", () => ({ db }));
vi.mock("../lib/verification", () => ({
  sendEmailChangeConfirmation: vi.fn(),
}));

const app = new Hono();
app.route("/api/account", accountRoutes);

const AUTH = {
  "content-type": "application/json",
  "x-user-id": "u1",
  "x-user-role": "CUSTOMER",
  "x-user-name": "Old Name",
};

function req(
  method: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = AUTH
) {
  return app.request(path, {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async (ops: unknown[]) =>
    Promise.all(ops as Promise<unknown>[])
  );
});

describe("PUT /api/account/profile", () => {
  it("updates name + normalized phone and reissues the session cookie", async () => {
    db.user.update.mockResolvedValue({
      id: "u1",
      name: "New Name",
      phone: "+94771234567",
      role: "CUSTOMER",
      sessionVersion: 3,
    });

    const res = await req("PUT", "/api/account/profile", {
      name: "New Name",
      phone: "0771234567",
    });
    expect(res.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { name: "New Name", phone: "+94771234567" },
    });
    // Session refreshed so the cached display name matches.
    expect(res.headers.get("set-cookie")).toContain("sh_session=");
  });

  it("rejects an invalid phone", async () => {
    const res = await req("PUT", "/api/account/profile", {
      name: "New Name",
      phone: "not-a-phone",
    });
    expect(res.status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("401s without a session", async () => {
    const res = await req(
      "PUT",
      "/api/account/profile",
      { name: "X Y", phone: "0771234567" },
      { "content-type": "application/json" }
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/account/email/change", () => {
  it("emails the new address when it is free", async () => {
    db.user.findUnique
      .mockResolvedValueOnce({ id: "u1", email: "old@baas.lk" }) // caller
      .mockResolvedValueOnce(null); // taken? no
    const res = await req("POST", "/api/account/email/change", {
      email: "new@baas.lk",
    });
    expect(res.status).toBe(200);
    expect(sendEmailChangeConfirmation).toHaveBeenCalledWith(
      "u1",
      "new@baas.lk",
      expect.any(String),
      expect.any(String)
    );
  });

  it("409s when the address is already taken", async () => {
    db.user.findUnique
      .mockResolvedValueOnce({ id: "u1", email: "old@baas.lk" })
      .mockResolvedValueOnce({ id: "u2", email: "new@baas.lk" });
    const res = await req("POST", "/api/account/email/change", {
      email: "new@baas.lk",
    });
    expect(res.status).toBe(409);
    expect(sendEmailChangeConfirmation).not.toHaveBeenCalled();
  });

  it("rejects changing to the same address", async () => {
    db.user.findUnique.mockResolvedValueOnce({ id: "u1", email: "old@baas.lk" });
    const res = await req("POST", "/api/account/email/change", {
      email: "OLD@baas.lk",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/account/email/confirm", () => {
  it("switches the email and marks it verified on a valid token", async () => {
    db.emailChangeToken.findUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      newEmail: "new@baas.lk",
      expiresAt: new Date(Date.now() + 60_000),
    });
    db.user.update.mockResolvedValue({ id: "u1" });
    db.emailChangeToken.deleteMany.mockResolvedValue({ count: 1 });

    const res = await req(
      "POST",
      "/api/account/email/confirm",
      { token: "raw-token" },
      { "content-type": "application/json" }
    );
    expect(res.status).toBe(200);
    const call = db.user.update.mock.calls[0][0];
    expect(call.data.email).toBe("new@baas.lk");
    expect(call.data.emailVerified).toBeInstanceOf(Date);
  });

  it("rejects an expired/unknown token", async () => {
    db.emailChangeToken.findUnique.mockResolvedValue(null);
    const res = await req(
      "POST",
      "/api/account/email/confirm",
      { token: "raw-token" },
      { "content-type": "application/json" }
    );
    expect(res.status).toBe(400);
    // token is hashed before lookup, never used raw
    expect(db.emailChangeToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashToken("raw-token") },
    });
  });
});
