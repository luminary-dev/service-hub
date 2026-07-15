import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { requireInternalSecret } from "./internal-secret";

// The dev fallback internal-secret.ts resolves at import time when
// INTERNAL_API_SECRET is unset (CI/dev). Kept in sync with lib/proxy.ts.
const SECRET = process.env.INTERNAL_API_SECRET ?? "dev-internal-secret";

function appWithGuard() {
  const app = new Hono();
  app.get("/metrics", requireInternalSecret, (c) => c.text("metrics-body"));
  return app;
}

describe("requireInternalSecret (gateway /metrics guard, #742)", () => {
  it("rejects a request with no internal secret", async () => {
    const res = await appWithGuard().request("/metrics");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("rejects a wrong internal secret", async () => {
    const res = await appWithGuard().request("/metrics", {
      headers: { "x-internal-secret": "not-the-secret" },
    });
    expect(res.status).toBe(403);
  });

  it("rejects a secret of a different length (no length-leak short-circuit)", async () => {
    const res = await appWithGuard().request("/metrics", {
      headers: { "x-internal-secret": SECRET + "x" },
    });
    expect(res.status).toBe(403);
  });

  it("serves the body when the correct internal secret is presented", async () => {
    const res = await appWithGuard().request("/metrics", {
      headers: { "x-internal-secret": SECRET },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("metrics-body");
  });
});
