import { describe, expect, it, vi } from "vitest";
import { turnstileEnabled, verifyTurnstile } from "./turnstile";

describe("turnstileEnabled", () => {
  it("is disabled when no secret is set", () => {
    expect(turnstileEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });
  it("is enabled when the secret is set", () => {
    expect(
      turnstileEnabled({ TURNSTILE_SECRET_KEY: "s" } as NodeJS.ProcessEnv)
    ).toBe(true);
  });
});

describe("verifyTurnstile", () => {
  // Graceful degradation: with no secret, verification is a no-op pass — a
  // missing token is fine, and siteverify is never called.
  it("passes without calling siteverify when disabled (no secret)", async () => {
    const fetchImpl = vi.fn();
    const res = await verifyTurnstile(undefined, { fetchImpl });
    expect(res).toEqual({ ok: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a missing token when enabled", async () => {
    const fetchImpl = vi.fn();
    const res = await verifyTurnstile(undefined, {
      secret: "s",
      fetchImpl,
    });
    expect(res).toEqual({ ok: false, reason: "missing" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("passes when siteverify returns success:true", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true }),
    })) as unknown as typeof fetch;
    const res = await verifyTurnstile("tok", { secret: "s", fetchImpl });
    expect(res).toEqual({ ok: true });
    // Secret + token are posted as x-www-form-urlencoded.
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(String(init.body)).toContain("secret=s");
    expect(String(init.body)).toContain("response=tok");
  });

  it("rejects as invalid when siteverify returns success:false", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: false }),
    })) as unknown as typeof fetch;
    const res = await verifyTurnstile("tok", { secret: "s", fetchImpl });
    expect(res).toEqual({ ok: false, reason: "invalid" });
  });

  it("reports unavailable on a non-2xx siteverify response", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    const res = await verifyTurnstile("tok", { secret: "s", fetchImpl });
    expect(res).toEqual({ ok: false, reason: "unavailable" });
  });

  it("reports unavailable (fails closed) when siteverify throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const res = await verifyTurnstile("tok", { secret: "s", fetchImpl });
    expect(res).toEqual({ ok: false, reason: "unavailable" });
  });
});
