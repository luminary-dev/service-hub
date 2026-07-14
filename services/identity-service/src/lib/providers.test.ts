import { afterEach, describe, expect, it, vi } from "vitest";
import {
  eraseProviderProfile,
  ProviderAdminSuspendedError,
  providerExists,
  reactivateProviderProfile,
  resolveProviderIdByUser,
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

  // #646/#361: a suspended profile is hidden from every public surface, so
  // favoriting it must 404 exactly like a missing id — not silently succeed.
  it("returns false when the provider exists but is suspended", async () => {
    stubFetch(200, { provider: { id: "p1", userId: "u1", suspended: true } });
    expect(await providerExists("p1")).toBe(false);
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

// #643: the fail-loud resolver backs complete-provider's create-vs-reactivate
// branch (and delete-account's erase). A `provider: null` on 200 is a real
// "no profile"; any non-ok status or transport error must throw so the caller
// aborts (502) instead of taking the wrong branch on a false null.
describe("resolveProviderIdByUser", () => {
  it("returns the provider id when the user owns a profile", async () => {
    stubFetch(200, { provider: { id: "prov-1", userId: "u1" } });
    expect(await resolveProviderIdByUser("u1")).toBe("prov-1");
  });

  it("returns null only when provider-service confirms no profile (200)", async () => {
    stubFetch(200, { provider: null });
    expect(await resolveProviderIdByUser("u1")).toBeNull();
  });

  it("throws on a 5xx so the caller 502s rather than acting on a false null", async () => {
    stubFetch(500, { error: "boom" });
    await expect(resolveProviderIdByUser("u1")).rejects.toThrow(/500/);
  });

  it("throws on a transport failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed: ECONNREFUSED");
      })
    );
    await expect(resolveProviderIdByUser("u1")).rejects.toThrow();
  });
});

// #554: the reactivate helper reports whether a profile actually existed so
// the admin promotion path can refuse to promote a user with no profile
// (provider-service answers 200 `reactivated: false` on the missing-profile
// no-op). Still a write-path gate: any non-ok status throws for a 502.
describe("reactivateProviderProfile", () => {
  it("returns true when a profile existed and was reactivated", async () => {
    stubFetch(200, { ok: true, reactivated: true });
    expect(await reactivateProviderProfile("u1")).toBe(true);
  });

  it("returns false when provider-service reports no profile", async () => {
    stubFetch(200, { ok: true, reactivated: false });
    expect(await reactivateProviderProfile("u1")).toBe(false);
  });

  it("throws on a 5xx so the caller 502s instead of guessing", async () => {
    stubFetch(500, { error: "boom" });
    await expect(reactivateProviderProfile("u1")).rejects.toThrow(/500/);
  });

  // #550: provider-service refuses to reactivate a profile under an ADMIN
  // suspension (409). That refusal must surface as the typed error so
  // complete-provider answers 403 (and the admin promotion 409) instead of
  // the generic 502 — and never lifts the suspension.
  it("throws ProviderAdminSuspendedError on 409 (admin suspension)", async () => {
    stubFetch(409, { error: "Suspended by admin" });
    await expect(reactivateProviderProfile("u1")).rejects.toBeInstanceOf(
      ProviderAdminSuspendedError
    );
  });

  it("does not classify other non-ok statuses as admin suspensions", async () => {
    stubFetch(500, { error: "boom" });
    const err = await reactivateProviderProfile("u1").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ProviderAdminSuspendedError);
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
