// Unit tests for the canonical error-capture module — identical copy in every
// backend service (same rationale as logging.test.ts). No DSN is set in the
// test env, so these exercise the MANDATORY graceful-degradation path: nothing
// initialises, no network is touched, and captureException stays a silent
// no-op. The @sentry/node SDK is mocked so we assert it is never invoked. (No
// test sets a DSN, so the module's `enabled` flag stays false throughout — no
// module reset is needed between cases.)
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureException, initErrorCapture } from "./errors";

const initMock = vi.fn();
const captureMock = vi.fn();
const setTagMock = vi.fn();

vi.mock("@sentry/node", () => ({
  init: (...args: unknown[]) => initMock(...args),
  captureException: (...args: unknown[]) => captureMock(...args),
  setTag: (...args: unknown[]) => setTagMock(...args),
}));

describe("error capture — graceful degradation with SENTRY_DSN unset", () => {
  const original = process.env.SENTRY_DSN;

  beforeEach(() => {
    initMock.mockClear();
    captureMock.mockClear();
    setTagMock.mockClear();
    delete process.env.SENTRY_DSN;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = original;
  });

  it("initErrorCapture never initialises the SDK when the DSN is unset", () => {
    expect(() => initErrorCapture("test-service")).not.toThrow();
    expect(initMock).not.toHaveBeenCalled();
    expect(setTagMock).not.toHaveBeenCalled();
  });

  it("treats an empty / whitespace-only DSN as unset", () => {
    process.env.SENTRY_DSN = "   ";
    initErrorCapture("test-service");
    expect(initMock).not.toHaveBeenCalled();
  });

  it("captureException is a no-op that never throws while capture is disabled", () => {
    expect(() => captureException(new Error("boom"))).not.toThrow();
    expect(() => captureException("a non-Error reason")).not.toThrow();
    expect(() =>
      captureException(new Error("with ctx"), { requestId: "r1" })
    ).not.toThrow();
    expect(captureMock).not.toHaveBeenCalled();
  });
});
