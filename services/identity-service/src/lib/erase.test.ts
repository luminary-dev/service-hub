// #551: the erase fan-out must delete the provider profile LAST. The job
// erase depends on the providerId resolved from the Provider row — if the
// provider erase committed first and the job erase failed, a retry would
// resolve providerId as null and the JobResponses (PII) would be stranded.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { db } = vi.hoisted(() => ({
  db: { favorite: { deleteMany: vi.fn() } },
}));
vi.mock("../db", () => ({ db }));

import { eraseUserData } from "./erase";

beforeEach(() => {
  db.favorite.deleteMany.mockReset();
  db.favorite.deleteMany.mockResolvedValue({ count: 0 });
});

afterEach(() => vi.unstubAllGlobals());

const PROVIDER = "http://localhost:4002";
const REVIEW = "http://localhost:4003";
const JOB = "http://localhost:4004";
const NOTIFICATION = "http://localhost:4005";

function stubFetch(statusFor: (url: string) => number) {
  const fetchMock = vi.fn(
    async (url: string | URL | Request, _init?: RequestInit) => {
      return new Response(JSON.stringify({ ok: true }), {
        status: statusFor(String(url)),
        headers: { "content-type": "application/json" },
      });
    }
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("eraseUserData", () => {
  it("erases review + job + notification first and the provider profile last", async () => {
    const fetchMock = stubFetch(() => 200);
    await expect(eraseUserData("u1", "prov-1")).resolves.toBeUndefined();

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toHaveLength(4);
    expect(urls.slice(0, 3).sort()).toEqual([
      `${REVIEW}/internal/users/u1/erase`,
      `${JOB}/internal/users/u1/erase`,
      `${NOTIFICATION}/internal/users/u1/erase`,
    ]);
    expect(urls[3]).toBe(`${PROVIDER}/internal/users/u1/erase`);
  });

  it("passes the providerId to the job erase", async () => {
    const fetchMock = stubFetch(() => 200);
    await eraseUserData("u1", "prov-1");

    const jobCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).startsWith(JOB)
    );
    expect(jobCall?.[1]?.body).toBe(JSON.stringify({ providerId: "prov-1" }));
  });

  it("passes the providerId to the review erase (#749)", async () => {
    const fetchMock = stubFetch(() => 200);
    await eraseUserData("u1", "prov-1");

    const reviewCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).startsWith(REVIEW)
    );
    expect(reviewCall?.[1]?.body).toBe(JSON.stringify({ providerId: "prov-1" }));
  });

  it("deletes favorites pointing at the erased provider (#767)", async () => {
    stubFetch(() => 200);
    await eraseUserData("u1", "prov-1");
    expect(db.favorite.deleteMany).toHaveBeenCalledWith({
      where: { providerId: "prov-1" },
    });
  });

  it("does not touch favorites when the user had no provider profile", async () => {
    stubFetch(() => 200);
    await eraseUserData("u1", null);
    expect(db.favorite.deleteMany).not.toHaveBeenCalled();
  });

  it("does NOT erase the provider profile when the job erase fails", async () => {
    const fetchMock = stubFetch((url) => (url.startsWith(JOB) ? 500 : 200));
    await expect(eraseUserData("u1", "prov-1")).rejects.toThrow(/500/);

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((u) => u.startsWith(PROVIDER))).toBe(false);
  });

  it("does NOT erase the provider profile when the review erase fails", async () => {
    const fetchMock = stubFetch((url) => (url.startsWith(REVIEW) ? 502 : 200));
    await expect(eraseUserData("u1", null)).rejects.toThrow(/502/);

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((u) => u.startsWith(PROVIDER))).toBe(false);
  });

  it("does NOT erase the provider profile when the notification erase fails", async () => {
    const fetchMock = stubFetch((url) => (url.startsWith(NOTIFICATION) ? 500 : 200));
    await expect(eraseUserData("u1", "prov-1")).rejects.toThrow(/500/);

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((u) => u.startsWith(PROVIDER))).toBe(false);
  });

  it("throws when the provider erase itself fails, so the User row survives for a retry", async () => {
    stubFetch((url) => (url.startsWith(PROVIDER) ? 500 : 200));
    await expect(eraseUserData("u1", "prov-1")).rejects.toThrow(/500/);
  });
});
