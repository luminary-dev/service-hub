import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Anthropic SDK is mocked so the SSE path runs with a deterministic,
// no-tool reply and never reaches the network. The mock streams one text delta
// then finishes with stop_reason "end_turn".
const streamMock = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class Anthropic {
    messages = {
      stream: (...args: unknown[]) => streamMock(...args),
    };
  }
  return { default: Anthropic };
});

import { app } from "../app";

const SECRET = "dev-internal-secret";

// A minimal fake of the SDK's MessageStream: `.on("text", cb)` emits deltas and
// `.finalMessage()` resolves with the assistant message.
function fakeTextStream(text: string) {
  return {
    on(event: string, cb: (delta: string) => void) {
      if (event === "text") cb(text);
      return this;
    },
    async finalMessage() {
      return { stop_reason: "end_turn", content: [{ type: "text", text }] };
    },
  };
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  streamMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("chat routes — internal secret", () => {
  it("rejects the stream endpoint without the internal secret (403)", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const res = await post("/internal/chat/marketplace/stream", {
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.status).toBe(403);
  });
});

describe("chat routes — request validation (secret present)", () => {
  const auth = { "x-internal-secret": SECRET };

  it("503s when ANTHROPIC_API_KEY is unset", async () => {
    const res = await post(
      "/internal/chat/marketplace/stream",
      { messages: [{ role: "user", content: "hi" }] },
      auth
    );
    expect(res.status).toBe(503);
  });

  it("404s an unknown persona", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const res = await post(
      "/internal/chat/does-not-exist/stream",
      { messages: [{ role: "user", content: "hi" }] },
      auth
    );
    expect(res.status).toBe(404);
  });
});

describe("chat routes — SSE framing", () => {
  const auth = { "x-internal-secret": SECRET };

  it("streams text as a data: frame and terminates with a done event", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    streamMock.mockReturnValue(fakeTextStream("Hello there"));

    const res = await post(
      "/internal/chat/marketplace/stream",
      { messages: [{ role: "user", content: "hi" }] },
      auth
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const text = await res.text();
    // Each event is a `data: {json}\n\n` frame.
    expect(text).toContain('data: {"type":"text","text":"Hello there"}\n\n');
    expect(text).toContain('data: {"type":"done"}\n\n');
    // The persona ran with no tool loop, so exactly one model stream was opened.
    expect(streamMock).toHaveBeenCalledTimes(1);
  });
});
