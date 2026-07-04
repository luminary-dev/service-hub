// Streaming assistant endpoint (#11). Runs the Claude tool loop server-side
// and streams SSE. Internal-only (behind the internal secret); the web app's
// /agent/chat route is a thin proxy that forwards the end-user's cookie/IP/
// locale here, keeping the ANTHROPIC_API_KEY out of the web runtime.
import { Hono } from "hono";
import Anthropic from "@anthropic-ai/sdk";
import { PERSONAS, type PersonaContext } from "../lib/personas";

export const chatRoutes = new Hono();

const MODEL = "claude-opus-4-8";
const MAX_TURNS = 40; // message-history cap per request
const MAX_LOOPS = 6; // tool-use loop safety bound

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
    cookie: c.req.header("x-forwarded-cookie") ?? "",
    forwardedFor: c.req.header("x-client-ip") ?? "unknown",
    gatewayUrl: GATEWAY_URL,
  };

  const anthropic = new Anthropic();
  const system = await persona.system(ctx);
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        for (let loop = 0; loop < MAX_LOOPS; loop++) {
          const msgStream = anthropic.messages.stream({
            model: MODEL,
            max_tokens: 4096, // chat replies are deliberately short
            thinking: { type: "adaptive" },
            output_config: { effort: "low" }, // latency-sensitive consumer chat
            system,
            tools: persona.tools,
            messages,
          });
          msgStream.on("text", (delta) => send({ type: "text", text: delta }));
          const message = await msgStream.finalMessage();

          if (message.stop_reason !== "tool_use") break;

          const toolUses = message.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
          );
          messages.push({ role: "assistant", content: message.content });

          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const tool of toolUses) {
            send({ type: "tool", name: tool.name });
            const result = await persona.runTool(
              tool.name,
              tool.input as Record<string, unknown>,
              ctx
            );
            results.push({
              type: "tool_result",
              tool_use_id: tool.id,
              content: result,
            });
          }
          messages.push({ role: "user", content: results });
        }
        send({ type: "done" });
      } catch (e) {
        console.error("[chat]", e);
        send({ type: "error" });
      } finally {
        controller.close();
      }
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
