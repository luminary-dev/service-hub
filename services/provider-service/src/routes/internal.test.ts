// Internal S2S route tests (#403 self-service downgrade). The deactivate route
// hides a provider's own profile by userId; the create path reactivates a
// self-deactivated profile on re-upgrade. Prisma is mocked; internal routes
// require the shared secret.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    provider: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../db", () => ({ db: dbMock }));

import { app } from "../app";

const SECRET = "dev-internal-secret";

function post(path: string, body?: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-secret": SECRET },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /internal/providers/by-user/:userId/deactivate", () => {
  it("suspends the caller's provider profile", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "prov1" });
    dbMock.provider.update.mockResolvedValue({ id: "prov1", suspended: true });

    const res = await post("/internal/providers/by-user/owner-1/deactivate");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deactivated: true });
    expect(dbMock.provider.update).toHaveBeenCalledWith({
      where: { id: "prov1" },
      data: { suspended: true },
    });
  });

  it("is a no-op when the user has no provider profile", async () => {
    dbMock.provider.findUnique.mockResolvedValue(null);
    const res = await post("/internal/providers/by-user/nobody/deactivate");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deactivated: false });
    expect(dbMock.provider.update).not.toHaveBeenCalled();
  });
});

describe("POST /internal/providers re-upgrade", () => {
  const body = {
    userId: "owner-1",
    name: "Ann",
    email: "a@b.lk",
    phone: "+94771234567",
    category: "plumbing",
    headline: "Plumber for hire",
    bio: "Twenty-plus characters of provider bio text.",
    district: "Colombo",
    city: "Colombo",
    experience: 3,
    services: [{ title: "Fix taps", price: 1000, priceType: "FIXED" }],
  };

  it("reactivates a previously self-deactivated profile", async () => {
    // create() hits the unique-userId constraint (profile already exists).
    dbMock.provider.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "7",
      })
    );
    dbMock.provider.findUnique.mockResolvedValue({ id: "prov1", suspended: true });
    dbMock.provider.update.mockResolvedValue({ id: "prov1", suspended: false });

    const res = await post("/internal/providers", body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "prov1" });
    expect(dbMock.provider.update).toHaveBeenCalledWith({
      where: { id: "prov1" },
      data: { suspended: false },
    });
  });
});
