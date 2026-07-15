// Streaming assistant endpoint (#11). Runs the Claude tool loop server-side
// and streams SSE. Internal-only (behind the internal secret); the web app's
// /agent/chat route is a thin proxy that forwards the end-user's cookie/IP/
// locale here, keeping the ANTHROPIC_API_KEY out of the web runtime.
import { Hono } from "hono";
import Anthropic from "@anthropic-ai/sdk";
import { log } from "../lib/log";
import { PERSONAS, type PersonaContext } from "../lib/personas";

export const chatRoutes = new Hono();

const MODEL = "claude-opus-4-8";
const MAX_TURNS = 40; // message-history cap per request
const MAX_LOOPS = 6; // tool-use loop safety bound
const MAX_BODY_BYTES = 256 * 1024; // reject oversized histories (memory guard)

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:4000";

type ChatMessage = { role: "user" | "assistant"; content: string };

chatRoutes.post("/internal/chat/:persona/stream", async (c) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return c.json({ error: "assistant unavailable" }, 503);
  }
  const persona = PERSONAS[c.req.param("persona")];
  if (!persona) {
    return c.json({ error: "unknown persona" }, 404);
  }

  // Defense in depth: the web proxy already caps + authenticates, but this
  // service is internal-only and must not buffer an unbounded body itself.
  if (Number(c.req.header("content-length") ?? 0) > MAX_BODY_BYTES) {
    return c.json({ error: "payload too large" }, 413);
  }

  const body = (await c.req.json().catch(() => null)) as {
    messages?: ChatMessage[];
  } | null;
  const history = (body?.messages ?? [])
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim() !== ""
    )
    .slice(-MAX_TURNS);
  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return c.json({ error: "invalid messages" }, 400);
  }

  const ctx: PersonaContext = {
    locale: c.req.header("x-locale") === "si" ? "si" : "en",
    gatewayUrl: GATEWAY_URL,
  };

  const anthropic = new Anthropic();
  const system = await persona.system(ctx);
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const encoder = new TextEncoder();

  // Abort plumbing (#754): an abandoned chat (closed tab, navigation, mobile
  // drop) must stop spending Anthropic tokens and gateway traffic. We tie a
  // single AbortController to two disconnect signals — the request's own
  // `c.req.raw.signal` and the ReadableStream `cancel()` callback — and pass
  // its signal into every `anthropic.messages.stream(...)` call so an in-flight
  // model request is torn down the moment the client goes away.
  const abortController = new AbortController();
  const requestOptions = { signal: abortController.signal };
  // Once the stream is closed (normally or via disconnect), enqueue() would
  // throw; `aborted` makes send() a no-op instead so a stray SDK text callback
  // firing after teardown can't surface as an unhandled error.
  let aborted = false;
  const abort = () => {
    if (aborted) return;
    aborted = true;
    abortController.abort();
  };

  // The web proxy forwards the end-user's request; when they disconnect, Hono
  // aborts this signal.
  const reqSignal = c.req.raw.signal;
  if (reqSignal?.aborted) abort();
  else reqSignal?.addEventListener("abort", abort, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        // No-op once the stream is closed/aborted so an abandoned chat neither
        // enqueues onto a dead controller nor throws inside an SDK listener.
        if (aborted) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          // Controller already closed (racing teardown): treat as aborted.
          aborted = true;
        }
      };
      try {
        let stopReason: string | null = null;
        for (let loop = 0; loop < MAX_LOOPS && !aborted; loop++) {
          const msgStream = anthropic.messages.stream(
            {
              model: MODEL,
              max_tokens: 4096, // chat replies are deliberately short
              thinking: { type: "adaptive" },
              output_config: { effort: "low" }, // latency-sensitive consumer chat
              system,
              tools: persona.tools,
              messages,
            },
            requestOptions
          );
          msgStream.on("text", (delta) => send({ type: "text", text: delta }));
          const message = await msgStream.finalMessage();
          stopReason = message.stop_reason;

          if (message.stop_reason !== "tool_use") break;

          const toolUses = message.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
          );
          messages.push({ role: "assistant", content: message.content });

          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const tool of toolUses) {
            // Stop the tool loop the moment the client is gone rather than
            // running the remaining (gateway-hitting) tool calls.
            if (aborted) break;
            send({ type: "tool", name: tool.name });
            const outcome = await persona.runTool(
              tool.name,
              tool.input as Record<string, unknown>,
              ctx
            );
            // Out-of-band event (e.g. an inquiry proposal card): streamed to the
            // browser only, never added to the model's message history.
            if (outcome.clientEvent) send(outcome.clientEvent);
            results.push({
              type: "tool_result",
              tool_use_id: tool.id,
              content: outcome.result,
            });
          }
          messages.push({ role: "user", content: results });
        }
        // If we hit MAX_LOOPS while the model still wanted to use tools, the
        // last tool results were never answered — make one final pass with no
        // tools so the user gets a closing message instead of silence.
        if (!aborted && stopReason === "tool_use") {
          const closing = anthropic.messages.stream(
            {
              model: MODEL,
              max_tokens: 4096,
              thinking: { type: "adaptive" },
              output_config: { effort: "low" },
              system,
              tools: [],
              messages,
            },
            requestOptions
          );
          closing.on("text", (delta) => send({ type: "text", text: delta }));
          await closing.finalMessage();
        }
        send({ type: "done" });
      } catch (e) {
        // An abort surfaces here as a rejected finalMessage(); that's expected
        // teardown, not a failure, so don't log it or emit an error event.
        if (!aborted) {
          log.error("stream failed", { context: "chat", err: e });
          send({ type: "error" });
        }
      } finally {
        reqSignal?.removeEventListener("abort", abort);
        if (!aborted) {
          aborted = true;
          try {
            controller.close();
          } catch {
            // Already closed by a racing cancel() — nothing to do.
          }
        }
      }
    },
    // Called when the consumer (the disconnecting client) cancels the response
    // body. Flip the flag and abort so the tool loop and model calls unwind.
    cancel() {
      abort();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
});
