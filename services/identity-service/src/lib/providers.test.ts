import { afterEach, describe, expect, it, vi } from "vitest";
import {
  eraseProviderProfile,
  ProviderAdminSuspendedError,
  providerExists,
  reactivateProviderProfile,
  resolveProviderIdForErase,
} from "./providers";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status: number, body: unknown = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        })
    )
  );
}

describe("providerExists", () => {
  it("returns true when the provider summary is found", async () => {
    stubFetch(200, { provider: { id: "p1", userId: "u1", suspended: false } });
    expect(await providerExists("p1")).toBe(true);
  });

  it("returns false when the summary body is { provider: null }", async () => {
    stubFetch(200, { provider: null });
    expect(await providerExists("missing")).toBe(false);
  });

  it("throws on a 5xx so the favorites write returns 502, not a false 404", async () => {
    stubFetch(500, { error: "boom" });
    await expect(providerExists("p1")).rejects.toThrow(/500/);
  });

  it("throws on a transport failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed: ECONNREFUSED");
      })
    );
    await expect(providerExists("p1")).rejects.toThrow();
  });
});

// #360: the account-deletion resolver is a write-path gate — it must fail loud
// so a transient blip aborts the deletion instead of erasing the User while
// leaving the provider's job responses (PII) behind.
describe("resolveProviderIdForErase", () => {
  it("returns the provider id when the user owns a profile", async () => {
    stubFetch(200, { provider: { id: "prov-1", userId: "u1" } });
    expect(await resolveProviderIdForErase("u1")).toBe("prov-1");
  });

  it("returns null only when provider-service confirms no profile (200)", async () => {
    stubFetch(200, { provider: null });
    expect(await resolveProviderIdForErase("u1")).toBeNull();
  });

  it("throws on a 5xx so delete-account 502s rather than passing a false null", async () => {
    stubFetch(500, { error: "boom" });
    await expect(resolveProviderIdForErase("u1")).rejects.toThrow(/500/);
  });

  it("throws on a transport failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed: ECONNREFUSED");
      })
    );
    await expect(resolveProviderIdForErase("u1")).rejects.toThrow();
  });
});

// #359: the compensating erase for a failed registration. Idempotent on the
// provider side, so a 200 (nothing committed, or an orphan removed) resolves;
// a non-ok status throws so the caller can log the failed cleanup.
describe("eraseProviderProfile", () => {
  it("hits the idempotent per-user erase endpoint", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(eraseProviderProfile("u1")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/internal/users/u1/erase"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws on a non-ok status so the failed cleanup is logged", async () => {
    stubFetch(500, { error: "boom" });
    await expect(eraseProviderProfile("u1")).rejects.toThrow(/500/);
  });
});

// #550: provider-service refuses to reactivate a profile under an ADMIN
// suspension (409). That refusal must surface as the typed error so
// complete-provider answers 403 and never flips the role; every other failure
// stays the generic write-path throw (→ 502).
describe("reactivateProviderProfile", () => {
  it("resolves on 200", async () => {
    stubFetch(200, { ok: true, reactivated: true });
    await expect(reactivateProviderProfile("u1")).resolves.toBeUndefined();
  });

  it("throws ProviderAdminSuspendedError on 409 (admin suspension)", async () => {
    stubFetch(409, { error: "Suspended by admin" });
    await expect(reactivateProviderProfile("u1")).rejects.toBeInstanceOf(
      ProviderAdminSuspendedError
    );
  });

  it("throws a generic error on other non-ok statuses", async () => {
    stubFetch(500, { error: "boom" });
    const err = await reactivateProviderProfile("u1").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ProviderAdminSuspendedError);
  });
});
