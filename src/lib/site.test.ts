import { afterEach, describe, expect, it, vi } from "vitest";

// SITE_URL is computed at module load from NEXT_PUBLIC_SITE_URL, so each case
// stubs the env and re-imports a fresh copy of the module.
async function loadSite() {
  vi.resetModules();
  return import("./site");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SITE_URL", () => {
  it("defaults to localhost in development", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined);
    const { SITE_URL } = await loadSite();
    expect(SITE_URL).toBe("http://localhost:3000");
  });

  it("uses NEXT_PUBLIC_SITE_URL when set", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://baas.lk");
    const { SITE_URL } = await loadSite();
    expect(SITE_URL).toBe("https://baas.lk");
  });

  it("strips a trailing slash so path concatenation stays clean", async () => {
    // sitemap/robots build URLs as `${SITE_URL}/path`; a trailing slash
    // would produce `https://baas.lk//path`.
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://baas.lk/");
    const { SITE_URL } = await loadSite();
    expect(SITE_URL).toBe("https://baas.lk");
  });
});
