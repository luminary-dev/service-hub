import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import type { Logger } from "./logging";
import { getRequestId } from "./logging";
import { gatewayRequestLogger } from "./request-log";

function fakeLogger() {
  const info = vi.fn();
  const log: Logger = { info, warn: vi.fn(), error: vi.fn() };
  return { log, info };
}

describe("gatewayRequestLogger (#759)", () => {
  it("logs one request line carrying a clientIp field", async () => {
    const { log, info } = fakeLogger();
    const app = new Hono();
    app.use(gatewayRequestLogger(log));
    app.get("/api/thing", (c) => c.json({ ok: true }));

    await app.request("/api/thing");

    expect(info).toHaveBeenCalledTimes(1);
    const [msg, fields] = info.mock.calls[0];
    expect(msg).toBe("request");
    expect(fields).toMatchObject({
      method: "GET",
      path: "/api/thing",
      status: 200,
    });
    // Under app.request() there is no node socket, so clientIp resolves to the
    // safe "unknown" sentinel — but the field is always present on gateway lines.
    expect(fields).toHaveProperty("clientIp");
  });

  it("stamps a generated request id on the context (client value never trusted)", async () => {
    const { log } = fakeLogger();
    const app = new Hono();
    let seen: string | undefined;
    app.use(gatewayRequestLogger(log));
    app.get("/api/thing", (c) => {
      seen = getRequestId(c);
      return c.text("ok");
    });

    await app.request("/api/thing", {
      headers: { "x-request-id": "client-supplied" },
    });

    expect(seen).toBeTruthy();
    expect(seen).not.toBe("client-supplied");
  });

  it("never logs the healthz probe", async () => {
    const { log, info } = fakeLogger();
    const app = new Hono();
    app.use(gatewayRequestLogger(log));
    app.get("/healthz", (c) => c.json({ ok: true }));

    await app.request("/healthz");

    expect(info).not.toHaveBeenCalled();
  });
});
