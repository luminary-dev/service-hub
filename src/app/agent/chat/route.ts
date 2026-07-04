// Site chat assistant (#11): helps a customer describe their job, suggests
// matching providers, and — after explicit confirmation — creates the inquiry
// on their behalf through the same public gateway endpoint the form uses.
// Lives OUTSIDE /api/* on purpose: that whole prefix is proxied to the
// gateway; this route is served by the web app itself, where the Anthropic
// key lives. Guests and signed-in users both work — the caller's cookie is
// forwarded so signed-in inquiries get a userId (and message threads).
import Anthropic from "@anthropic-ai/sdk";
import { cookies, headers } from "next/headers";

// Caching (#57): per-user streaming chat — never cache this route.
export const dynamic = "force-dynamic";

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:4000";
const MODEL = "claude-opus-4-8";
const MAX_TURNS = 40; // message-history cap per request body
const MAX_LOOPS = 6; // tool-use loop safety bound

type ChatMessage = { role: "user" | "assistant"; content: string };

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_providers",
    description:
      "Search the Baas.lk provider directory. Call this when the customer has told you their trade/category (and ideally district) so you can suggest real providers. Returns up to 5 matches with id, name, rating and starting price.",
    input_schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description:
            "Category slug from the category list in your instructions (e.g. plumber, electrician).",
        },
        district: {
          type: "string",
          description: "Sri Lankan district name, e.g. Colombo, Kandy.",
        },
        q: {
          type: "string",
          description: "Free-text search over headlines/bios, optional.",
        },
      },
      required: [],
    },
  },
  {
    name: "create_inquiry",
    description:
      "Create an inquiry to a specific provider on the customer's behalf. ONLY call this after you have (1) shown the customer the exact provider and message text, and (2) they explicitly confirmed sending it. Never call it speculatively.",
    input_schema: {
      type: "object",
      properties: {
        providerId: { type: "string", description: "Provider id from search_providers." },
        name: { type: "string", description: "Customer's name." },
        phone: {
          type: "string",
          description: "Customer's Sri Lankan phone number (e.g. 0771234567).",
        },
        message: {
          type: "string",
          description:
            "The inquiry message describing the job (10-2000 chars), as confirmed by the customer.",
        },
        confirmed: {
          type: "boolean",
          description:
            "Must be true, and may only be true after the customer explicitly said to send it.",
        },
      },
      required: ["providerId", "name", "phone", "message", "confirmed"],
    },
  },
];

async function fetchCategories(): Promise<string> {
  try {
    const res = await fetch(`${GATEWAY_URL}/api/categories`, {
      cache: "no-store",
    });
    if (!res.ok) return "";
    const data = (await res.json()) as {
      categories: { slug: string; labelEn: string; labelSi: string }[];
    };
    return data.categories
      .map((c) => `${c.slug} (${c.labelEn} / ${c.labelSi})`)
      .join(", ");
  } catch {
    return "";
  }
}

function systemPrompt(locale: string, categories: string): string {
  return `You are the Baas.lk assistant. Baas.lk is a Sri Lankan marketplace connecting customers with local service professionals (mechanics, electricians, plumbers and more). Customers describe a job; you help them find the right professional and, when they are ready, send an inquiry for them.

How to work:
- Find out what you're missing before searching: the trade (category), the district, and a short description of the job. Ask for at most one or two things per message.
- Use search_providers once you know the category (district narrows it further). Present up to 3 suggestions as a short list: name, rating if any, starting price if any, and the profile link https://baas.lk/providers/<id>.
- To send an inquiry you need the customer's name, a Sri Lankan phone number, and the message text. Draft the message for them from the job description.
- Before sending, show exactly: which provider, and the full message text, then ask them to confirm. Only after an explicit yes, call create_inquiry with confirmed=true.
- Never invent providers or details. If a search returns nothing, say so and suggest broadening.
- You cannot negotiate prices, make bookings, or access accounts. For anything beyond finding professionals and sending inquiries, say what you can do instead.
- Keep replies short and conversational (2-5 sentences plus a list when suggesting providers). No markdown headings.
${locale === "si" ? "- Reply in Sinhala (සිංහල). Keep provider names as-is." : "- Reply in English unless the customer writes in Sinhala, then follow their language."}

Category slugs you can use for search_providers: ${categories || "(category list unavailable — ask the customer to describe the trade and use the q parameter instead)"}`;
}

async function runTool(
  name: string,
  input: Record<string, unknown>,
  clientHeaders: { cookie: string; forwardedFor: string }
): Promise<string> {
  if (name === "search_providers") {
    const qs = new URLSearchParams({ pageSize: "5" });
    if (typeof input.category === "string" && input.category) qs.set("category", input.category);
    if (typeof input.district === "string" && input.district) qs.set("district", input.district);
    if (typeof input.q === "string" && input.q) qs.set("q", input.q);
    const res = await fetch(`${GATEWAY_URL}/api/providers?${qs}`, { cache: "no-store" });
    if (!res.ok) return JSON.stringify({ error: "search unavailable" });
    const data = (await res.json()) as { providers: Record<string, unknown>[]; total: number };
    return JSON.stringify({
      total: data.total,
      providers: data.providers.slice(0, 5).map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        district: p.district,
        city: p.city,
        rating: p.rating,
        reviewCount: p.reviewCount,
        fromPrice: p.fromPrice,
        available: p.available,
      })),
    });
  }

  if (name === "create_inquiry") {
    if (input.confirmed !== true) {
      return JSON.stringify({
        error: "not confirmed — ask the customer to confirm before sending",
      });
    }
    const res = await fetch(
      `${GATEWAY_URL}/api/providers/${encodeURIComponent(String(input.providerId))}/inquiries`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
          // Preserve the real client for gateway rate limiting, and the
          // session cookie so signed-in inquiries carry a userId (threads).
          "x-forwarded-for": clientHeaders.forwardedFor,
          ...(clientHeaders.cookie ? { cookie: clientHeaders.cookie } : {}),
        },
        body: JSON.stringify({
          name: input.name,
          phone: input.phone,
          message: input.message,
          source: "chat-agent",
        }),
        cache: "no-store",
      }
    );
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return JSON.stringify({ error: (data.error as string) ?? "could not send the inquiry" });
    }
    return JSON.stringify({ ok: true });
  }

  return JSON.stringify({ error: `unknown tool ${name}` });
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "assistant unavailable" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
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
    return Response.json({ error: "invalid messages" }, { status: 400 });
  }

  const [cookieStore, headerStore, categories] = await Promise.all([
    cookies(),
    headers(),
    fetchCategories(),
  ]);
  const locale = cookieStore.get("lang")?.value === "si" ? "si" : "en";
  const clientHeaders = {
    cookie: cookieStore
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join("; "),
    forwardedFor:
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
  };

  const anthropic = new Anthropic();
  const system = systemPrompt(locale, categories);
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        // Manual streaming tool loop: stream text deltas out as they arrive;
        // when the model calls tools, execute them and continue the loop.
        for (let loop = 0; loop < MAX_LOOPS; loop++) {
          const msgStream = anthropic.messages.stream({
            model: MODEL,
            max_tokens: 4096, // chat widget replies are deliberately short
            thinking: { type: "adaptive" },
            output_config: { effort: "low" }, // latency-sensitive consumer chat
            system,
            tools: TOOLS,
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
            const result = await runTool(
              tool.name,
              tool.input as Record<string, unknown>,
              clientHeaders
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
        console.error("[chat-agent]", e);
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
}
