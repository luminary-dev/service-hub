# chat-service

> [!WARNING]
> This repository is a **read-only mirror** of [`services/chat-service`](https://github.com/luminary-dev/service-hub/tree/main/services/chat-service) in the service-hub monorepo. Do not push or open PRs here — changes land via monorepo PRs and are synced out with `npm run sync:repos`. Direct pushes are blocked by branch protection.

AI assistant service for Service Hub (Baas.lk), listening on `:4007`. It holds
the `ANTHROPIC_API_KEY` and runs the streaming Claude tool loop server-side,
isolating the LLM credential and blast radius from the web runtime. Stateless
(no DB). Internal-only: every request except `/healthz` carries
`x-internal-secret` (constant-time checked), else `403 { "error": "Forbidden" }`.

## Endpoint

- `POST /internal/chat/:persona/stream` — runs the Claude tool loop for the named
  persona and returns Server-Sent Events (`text` / `tool` / `done` / `error`).
  The web app's `/agent/chat` route is a thin proxy that forwards the end-user's
  cookie, IP and locale here. Responses: `503` when `ANTHROPIC_API_KEY` is unset,
  `404` unknown persona, `413` over 256 KB, `400` on empty/invalid history.
- `GET /healthz` → `{ ok: true, service: "chat-service" }` (no secret).

## Claude tool loop (`src/routes/chat.ts`)

Model **`claude-opus-4-8`**, `max_tokens: 4096`, adaptive thinking, low output
effort (latency-sensitive consumer chat). It streams text deltas live via
`anthropic.messages.stream(...)`; when the model stops on `tool_use` it runs each
tool via the persona's runner, appends the results, and loops. Safety bounds:
history capped to the last **40 turns**, tool-use loop bounded to **6** passes
(a final `tools: []` pass guarantees a closing message), and a **256 KB** body
guard. Every gateway fetch a tool makes has an 8s deadline so a hung gateway
can't hold the SSE connection open.

## Personas & tools

A **persona** (`src/lib/personas.ts`) bundles a system prompt, a tool set and a
tool runner. The registry (`PERSONAS`) is built to host several — adding one is a
new entry — and ships with the **marketplace** concierge (bilingual; Sinhala when
`x-locale: si`), which exposes two tools:

- `search_providers` — queries the public browse API (`GET /api/providers`) for
  up to 5 matches.
- `create_inquiry` — creates an inquiry on the customer's behalf
  (`source: chat-agent`), and **only** after explicit `confirmed: true`.

Tool calls go outward to the gateway (`GATEWAY_URL`) carrying the forwarded
cookie (signed-in attribution) and the real client IP (gateway rate limiting).
Tool results are treated as untrusted data — only the customer's explicit
confirmation authorizes a send (prompt-injection hardening). There are no
server-side sessions; the web proxy sends the full (capped) history each request.

## Environment

| var | default | purpose |
|---|---|---|
| `PORT` | `4007` | listen port |
| `INTERNAL_API_SECRET` | `dev-internal-secret` (required in production) | S2S auth |
| `ANTHROPIC_API_KEY` | *(unset → 503)* | Claude API credential |
| `GATEWAY_URL` | `http://localhost:4000` | gateway base URL for tool calls |
