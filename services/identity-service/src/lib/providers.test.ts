import { afterEach, describe, expect, it, vi } from "vitest";
import { providerExists } from "./providers";

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
