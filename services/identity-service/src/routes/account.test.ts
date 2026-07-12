// Route tests for the account self-service handlers (#396): profile edit
// (name/phone + session-name refresh) and the change-email request/confirm
// lifecycle. Prisma and the change-email sender are mocked; createSession runs
// for real (signs a JWT with the dev secret + sets the cookie).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { accountRoutes } from "./account";
import { hashToken } from "../lib/tokens";
import { sendEmailChangeConfirmation } from "../lib/verification";
import { removeStoredFile, storeImage } from "../lib/storage";

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
// Keep the real ALLOWED_IMAGE_TYPES / MAX_UPLOAD_SIZE constants and the
// InvalidImageError class; only the media-service network calls are stubbed.
vi.mock("../lib/storage", async (importActual) => {
  const actual = await importActual<typeof import("../lib/storage")>();
  return { ...actual, storeImage: vi.fn(), removeStoredFile: vi.fn() };
});
vi.mock("../lib/providers", () => ({ syncAvatarToProvider: vi.fn() }));

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

  it("normalizes a mixed-case new address: taken-check runs on the lowercase form and 409s (M8)", async () => {
    db.user.findUnique
      .mockResolvedValueOnce({ id: "u1", email: "old@baas.lk" }) // caller
      .mockResolvedValueOnce({ id: "u2", email: "new@baas.lk" }); // taken
    const res = await req("POST", "/api/account/email/change", {
      email: "New@Baas.LK",
    });
    expect(res.status).toBe(409);
    // The uniqueness check must query the lowercase address we actually store,
    // otherwise a case-variant slips past it.
    expect(db.user.findUnique).toHaveBeenLastCalledWith({
      where: { email: "new@baas.lk" },
    });
    expect(sendEmailChangeConfirmation).not.toHaveBeenCalled();
  });

  it("emails the lowercase form of a mixed-case new address when free (M8)", async () => {
    db.user.findUnique
      .mockResolvedValueOnce({ id: "u1", email: "old@baas.lk" }) // caller
      .mockResolvedValueOnce(null); // taken? no
    const res = await req("POST", "/api/account/email/change", {
      email: "New@Baas.LK",
    });
    expect(res.status).toBe(200);
    expect(sendEmailChangeConfirmation).toHaveBeenCalledWith(
      "u1",
      "new@baas.lk",
      expect.any(String),
      expect.any(String)
    );
  });
});

describe("avatar cleanup (orphaned-file leak)", () => {
  // Auth headers without the JSON content-type — the avatar upload reads
  // multipart formData, so undici sets the boundary content-type itself.
  const AUTH_MULTIPART = {
    "x-user-id": "u1",
    "x-user-role": "CUSTOMER",
    "x-user-name": "Old Name",
  };

  function uploadReq(headers: Record<string, string> = AUTH_MULTIPART) {
    const form = new FormData();
    form.set("file", new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }));
    return app.request("/api/account/avatar", { method: "POST", headers, body: form });
  }

  const UPDATED = {
    id: "u1",
    name: "Old Name",
    role: "CUSTOMER",
    sessionVersion: 1,
    avatarUrl: "https://media/new.png",
  };

  it("removes the prior avatar file when replacing it", async () => {
    db.user.findUnique.mockResolvedValue({ avatarUrl: "https://media/old.png" });
    vi.mocked(storeImage).mockResolvedValue("https://media/new.png");
    db.user.update.mockResolvedValue(UPDATED);

    const res = await uploadReq();
    expect(res.status).toBe(200);
    expect(storeImage).toHaveBeenCalled();
    expect(removeStoredFile).toHaveBeenCalledWith("https://media/old.png");
  });

  it("does NOT remove anything on the first upload (no prior avatar)", async () => {
    db.user.findUnique.mockResolvedValue({ avatarUrl: null });
    vi.mocked(storeImage).mockResolvedValue("https://media/new.png");
    db.user.update.mockResolvedValue(UPDATED);

    const res = await uploadReq();
    expect(res.status).toBe(200);
    expect(removeStoredFile).not.toHaveBeenCalled();
  });

  it("never removes the just-set object when the store returns the same URL", async () => {
    db.user.findUnique.mockResolvedValue({ avatarUrl: "https://media/new.png" });
    vi.mocked(storeImage).mockResolvedValue("https://media/new.png");
    db.user.update.mockResolvedValue(UPDATED);

    const res = await uploadReq();
    expect(res.status).toBe(200);
    expect(removeStoredFile).not.toHaveBeenCalled();
  });

  it("removes the stored file on delete when one existed", async () => {
    db.user.findUnique.mockResolvedValue({ avatarUrl: "https://media/old.png" });
    db.user.update.mockResolvedValue({ ...UPDATED, avatarUrl: null });

    const res = await app.request("/api/account/avatar", {
      method: "DELETE",
      headers: AUTH_MULTIPART,
    });
    expect(res.status).toBe(200);
    expect(removeStoredFile).toHaveBeenCalledWith("https://media/old.png");
  });

  it("does NOT call removeStoredFile on delete when there was no avatar", async () => {
    db.user.findUnique.mockResolvedValue({ avatarUrl: null });
    db.user.update.mockResolvedValue({ ...UPDATED, avatarUrl: null });

    const res = await app.request("/api/account/avatar", {
      method: "DELETE",
      headers: AUTH_MULTIPART,
    });
    expect(res.status).toBe(200);
    expect(removeStoredFile).not.toHaveBeenCalled();
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

  it("stores the address lowercase even if the token carried a mixed-case value (M8)", async () => {
    db.emailChangeToken.findUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      newEmail: "New@Baas.LK",
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
    // Password login lowercases its input, so the persisted email must be
    // lowercase or the account could never log in again.
    expect(db.user.update.mock.calls[0][0].data.email).toBe("new@baas.lk");
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
