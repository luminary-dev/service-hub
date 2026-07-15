import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The module guards against client bundles; a no-op stand-in lets node tests
// import it (mirrors session-version.test.ts).
vi.mock("server-only", () => ({}));

// The secret resolves at import time (fail-fast-on-boot), so each case gets a
// fresh module after stubbing the env.
beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("INTERNAL_API_SECRET", () => {
  it("uses the env value when set", async () => {
    vi.stubEnv("INTERNAL_API_SECRET", "s3cret-from-env");
    const { INTERNAL_API_SECRET } = await import("./internal-secret");
    expect(INTERNAL_API_SECRET).toBe("s3cret-from-env");
  });

  it("throws in production when unset so the web runtime refuses to boot", async () => {
    vi.stubEnv("INTERNAL_API_SECRET", undefined);
    vi.stubEnv("NODE_ENV", "production");
    await expect(import("./internal-secret")).rejects.toThrow(
      "INTERNAL_API_SECRET must be set in production"
    );
  });

  it("falls back to the dev constant when unset outside production", async () => {
    vi.stubEnv("INTERNAL_API_SECRET", undefined);
    vi.stubEnv("NODE_ENV", "development");
    const { INTERNAL_API_SECRET } = await import("./internal-secret");
    expect(INTERNAL_API_SECRET).toBe("dev-internal-secret");
  });
});
