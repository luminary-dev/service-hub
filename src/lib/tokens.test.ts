import { describe, it, expect } from "vitest";
import { createToken, hashToken } from "./tokens";

describe("tokens", () => {
  it("hashToken is deterministic and sha256-shaped", () => {
    const h = hashToken("abc");
    expect(h).toBe(hashToken("abc"));
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it("createToken returns a raw token whose hash matches hashToken", () => {
    const { raw, hash } = createToken();
    expect(raw).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(hashToken(raw));
  });

  it("createToken is unique per call", () => {
    const a = createToken();
    const b = createToken();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
  });

  it("the raw token is never equal to its stored hash", () => {
    const { raw, hash } = createToken();
    expect(raw).not.toBe(hash);
  });
});
