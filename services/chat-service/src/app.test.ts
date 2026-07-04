import { beforeEach, describe, expect, it } from "vitest";
import { app } from "./app";

const SECRET = "dev-internal-secret";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("GET /healthz", () => {
  it("responds without the internal secret", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: "chat-service" });
  });
});

describe("internal secret enforcement", () => {
  it("rejects the stream endpoint without the secret", async () => {
    const res = await app.request("/internal/chat/marketplace/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    });
    expect(res.status).toBe(403);
  });
});

describe("stream endpoint validation (secret present)", () => {
  function post(path: string, body: unknown) {
    return app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": SECRET },
      body: JSON.stringify(body),
    });
  }

  it("503s when ANTHROPIC_API_KEY is unset", async () => {
    const res = await post("/internal/chat/marketplace/stream", {
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.status).toBe(503);
  });

  it("404s an unknown persona", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const res = await post("/internal/chat/nope/stream", {
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.status).toBe(404);
  });

  it("400s when the last message isn't from the user", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const res = await post("/internal/chat/marketplace/stream", {
      messages: [{ role: "assistant", content: "hi" }],
    });
    expect(res.status).toBe(400);
  });

  it("400s empty history", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const res = await post("/internal/chat/marketplace/stream", { messages: [] });
    expect(res.status).toBe(400);
  });
});
