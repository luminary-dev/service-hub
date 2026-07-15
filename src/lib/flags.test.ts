import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The module guards against client bundles; a no-op stand-in lets node tests
// import it (mirrors session-version.test.ts).
vi.mock("server-only", () => ({}));

import { __resetFlagCache, isFlagEnabled } from "./flags";

const fetchMock = vi.fn();

// Shape of the Unleash Frontend API response — only ENABLED toggles appear.
function frontendResponse(names: string[]) {
  return {
    ok: true,
    json: async () => ({
      toggles: names.map((name) => ({ name, enabled: true })),
    }),
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  __resetFlagCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetchMock.mockReset();
});

describe("isFlagEnabled", () => {
  it("returns the fallback and makes NO network call when the service is unset", async () => {
    // No UNLEASH_URL / UNLEASH_FRONTEND_TOKEN — the dev/CI/pre-provision path.
    expect(await isFlagEnabled("chat-assistant", true)).toBe(true);
    expect(await isFlagEnabled("some-other-flag", false)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the fallback when only one of URL/token is set (still a no-op)", async () => {
    vi.stubEnv("UNLEASH_URL", "http://unleash:4242/api");
    expect(await isFlagEnabled("chat-assistant", true)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("when the service is configured", () => {
    beforeEach(() => {
      vi.stubEnv("UNLEASH_URL", "http://unleash:4242/api");
      vi.stubEnv("UNLEASH_FRONTEND_TOKEN", "test-frontend-token");
    });

    it("reads a flag as ON when Unleash reports it enabled", async () => {
      fetchMock.mockResolvedValue(frontendResponse(["chat-assistant"]));
      // fallback is false, so a `true` result proves it came from Unleash.
      expect(await isFlagEnabled("chat-assistant", false)).toBe(true);
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("http://unleash:4242/api/frontend");
      expect((init.headers as Record<string, string>).Authorization).toBe(
        "test-frontend-token"
      );
    });

    it("reads a flag as OFF when it is absent from the enabled toggles", async () => {
      // A flag not created/enabled in Unleash never appears — reads as off even
      // when the caller's fallback is true (the token is the activation switch).
      fetchMock.mockResolvedValue(frontendResponse(["another-flag"]));
      expect(await isFlagEnabled("chat-assistant", true)).toBe(false);
    });

    it("caches the toggle set within the TTL (one call per window)", async () => {
      fetchMock.mockResolvedValue(frontendResponse(["chat-assistant"]));
      await isFlagEnabled("chat-assistant", false);
      await isFlagEnabled("another-flag", false);
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("degrades to the fallback when Unleash returns a non-2xx response", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 503 });
      expect(await isFlagEnabled("chat-assistant", true)).toBe(true);
    });

    it("degrades to the fallback when the fetch throws (timeout/unreachable)", async () => {
      fetchMock.mockRejectedValue(new Error("aborted"));
      expect(await isFlagEnabled("chat-assistant", true)).toBe(true);
      expect(await isFlagEnabled("chat-assistant", false)).toBe(false);
    });

    it("passes evaluation context as query params for targeted rollouts", async () => {
      fetchMock.mockResolvedValue(frontendResponse([]));
      await isFlagEnabled("search-ranking-v2", false, { userId: "u-123" });
      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe("http://unleash:4242/api/frontend?userId=u-123");
    });
  });
});
