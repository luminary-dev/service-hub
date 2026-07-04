// Assistant personas (#11). A persona bundles a system prompt, a tool set,
// and a tool runner. The service is built to host several — adding one is a
// new entry in the PERSONAS registry — but ships with just the marketplace
// concierge today.
import Anthropic from "@anthropic-ai/sdk";

export type PersonaContext = {
  locale: "en" | "si";
  // The end-user's session cookie and real IP, forwarded from the web proxy
  // so tool calls to the gateway carry the user's identity (signed-in
  // attribution) and the correct client for rate limiting.
  cookie: string;
  forwardedFor: string;
  gatewayUrl: string;
};

export interface Persona {
  tools: Anthropic.Tool[];
  system(ctx: PersonaContext): Promise<string> | string;
  runTool(
    name: string,
    input: Record<string, unknown>,
    ctx: PersonaContext
  ): Promise<string>;
}

// --- marketplace concierge -------------------------------------------------

const marketplaceTools: Anthropic.Tool[] = [
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

async function fetchCategories(gatewayUrl: string): Promise<string> {
  try {
    const res = await fetch(`${gatewayUrl}/api/categories`, { cache: "no-store" });
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

const marketplace: Persona = {
  tools: marketplaceTools,
  async system(ctx) {
    const categories = await fetchCategories(ctx.gatewayUrl);
    return `You are the Baas.lk assistant. Baas.lk is a Sri Lankan marketplace connecting customers with local service professionals (mechanics, electricians, plumbers and more). Customers describe a job; you help them find the right professional and, when they are ready, send an inquiry for them.

How to work:
- Find out what you're missing before searching: the trade (category), the district, and a short description of the job. Ask for at most one or two things per message.
- Use search_providers once you know the category (district narrows it further). Present up to 3 suggestions as a short list: name, rating if any, starting price if any, and the profile link https://baas.lk/providers/<id>.
- To send an inquiry you need the customer's name, a Sri Lankan phone number, and the message text. Draft the message for them from the job description.
- Before sending, show exactly: which provider, and the full message text, then ask them to confirm. Only after an explicit yes, call create_inquiry with confirmed=true.
- Never invent providers or details. If a search returns nothing, say so and suggest broadening.
- You cannot negotiate prices, make bookings, or access accounts. For anything beyond finding professionals and sending inquiries, say what you can do instead.
- Keep replies short and conversational (2-5 sentences plus a list when suggesting providers). No markdown headings.
${ctx.locale === "si" ? "- Reply in Sinhala (සිංහල). Keep provider names as-is." : "- Reply in English unless the customer writes in Sinhala, then follow their language."}

Category slugs you can use for search_providers: ${categories || "(category list unavailable — ask the customer to describe the trade and use the q parameter instead)"}`;
  },
  async runTool(name, input, ctx) {
    if (name === "search_providers") {
      const qs = new URLSearchParams({ pageSize: "5" });
      if (typeof input.category === "string" && input.category) qs.set("category", input.category);
      if (typeof input.district === "string" && input.district) qs.set("district", input.district);
      if (typeof input.q === "string" && input.q) qs.set("q", input.q);
      const res = await fetch(`${ctx.gatewayUrl}/api/providers?${qs}`, { cache: "no-store" });
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
        `${ctx.gatewayUrl}/api/providers/${encodeURIComponent(String(input.providerId))}/inquiries`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "sec-fetch-site": "same-origin",
            // The end-user's real client (gateway rate limiting) and session
            // cookie (signed-in inquiries carry a userId → message threads).
            "x-forwarded-for": ctx.forwardedFor,
            ...(ctx.cookie ? { cookie: ctx.cookie } : {}),
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
  },
};

export const PERSONAS: Record<string, Persona> = {
  marketplace,
};
