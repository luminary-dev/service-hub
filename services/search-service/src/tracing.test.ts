// Drift guard + no-op contract for the tracing bootstrap (#668). Byte-identical
// across every service (see src/lib/shared-copies.test.ts). Tracing MUST be a
// pure no-op when OTEL_EXPORTER_OTLP_ENDPOINT is unset so merely loading the
// module can never break a boot — dev and CI never set the endpoint.
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// Importing the module runs its auto-start once. With no endpoint set (the test
// default) that top-level call is itself a no-op, so the import cannot throw.
import { startTracing } from "./tracing";

describe("tracing bootstrap", () => {
  const saved = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  beforeEach(() => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = saved;
  });

  it("no-ops when the OTLP endpoint is unset", () => {
    expect(typeof startTracing).toBe("function");
    // Unset endpoint → pure no-op, returns false, never throws.
    expect(startTracing()).toBe(false);
  });
});
