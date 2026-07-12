import { afterEach, describe, expect, it, vi } from "vitest";
import { providerExists, resolveProviderIdForErase } from "./providers";

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

  it("returns false only on a 404", async () => {
    stubFetch(404, { error: "not found" });
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
