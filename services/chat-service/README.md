# chat-service

> [!WARNING]
> This repository is a **read-only mirror** of [`services/chat-service`](https://github.com/luminary-dev/service-hub/tree/main/services/chat-service) in the service-hub monorepo. Do not push or open PRs here — changes land via monorepo PRs and are synced out with `npm run sync:repos`. Direct pushes are blocked by branch protection.

AI assistant service for Service Hub (Baas.lk), listening on `:4007`. It holds the `ANTHROPIC_API_KEY` and runs the streaming Claude tool loop server-side, isolating the LLM credential and blast radius from the web runtime. Stateless (no DB).

## What it does

- `POST /internal/chat/:persona/stream` — runs a Claude (`claude-opus-4-8`, adaptive thinking, low effort) streaming tool loop for the named persona and returns Server-Sent Events (`text`/`tool`/`done`/`error`). Internal-only (behind the internal secret); the web app's `/agent/chat` route is a thin proxy that forwards the end-user's cookie, IP and locale here. `503` when `ANTHROPIC_API_KEY` is unset.

## Personas

A **persona** (`src/lib/personas.ts`) bundles a system prompt, a tool set, and a tool runner. The service is built to host several — adding one is a new entry in the `PERSONAS` registry — and ships with the **marketplace** concierge: `search_providers` (public browse API) and `create_inquiry` (creates an inquiry on the customer's behalf, `source: chat-agent`, only after explicit confirmation). Tool calls go to the gateway carrying the forwarded cookie (signed-in attribution) and client IP (rate limiting).
