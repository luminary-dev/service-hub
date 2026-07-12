# AI chat assistant


A marketplace concierge that helps customers find a provider and draft an
inquiry, which the customer then sends themselves, in English or Sinhala.

- **Where it runs.** The assistant runs entirely server-side in **chat-service**
  (internal-only), keeping `ANTHROPIC_API_KEY` out of the web runtime. The web
  route `POST /agent/chat` is a thin proxy to
  `POST /internal/chat/marketplace/stream`, streaming Server-Sent Events back to
  the browser and forwarding only the locale. No session cookie is forwarded
  into the LLM-driven service, because nothing there acts on the user's behalf.
  The reply locale follows the app's usual precedence (the `/si` URL prefix
  wins, then the `lang` cookie — see `src/lib/locale.ts`): the client requests
  the `/si/agent/chat` variant on Sinhala URLs so the proxy's trusted `x-locale`
  header carries the URL locale, and the route resolves it with `getLocale()`.
  A visitor on a shared `/si` link therefore gets Sinhala replies even without a
  `lang` cookie.
- **Model & loop.** Uses Claude (`claude-opus-4-8`) with a server-side tool
  loop: it streams text, and when the model requests a tool it runs it, feeds
  the result back, and continues — up to a safety bound (`MAX_LOOPS = 6`), with a
  message-history cap (`MAX_TURNS = 40`) and a 256 KB request-body cap.
- **Tools the model can call:**
  - `search_providers(category?, district?, q?)` — queries the public directory
    and returns up to 5 matches.
  - `propose_inquiry(providerId, providerName?, name, phone, message)` — does
    **not** write anything. It streams a draft to the browser as an out-of-band
    `proposal` event; the browser renders a confirmation card. The model cannot
    send an inquiry.
- **Out-of-band confirmation (#202).** The real inquiry is created only when the
  **user taps "Confirm & send"** on that card, which fires a normal
  authenticated same-origin `POST /api/providers/:id/inquiries` (the same
  endpoint the plain inquiry form uses, tagged `source: "chat-agent"`) with the
  exact fields the card showed. Confirmation is a user action captured **outside
  the model's control** — a prompt-injected or manipulated model can propose a
  draft but can never send it, since the write path is not a tool it can invoke.
- **Persona & safety.** The system prompt scopes it to Baas.lk, asks for at most
  1–2 things per turn (trade, district, job), suggests up to 3 providers, and
  treats tool-result data as untrusted (it can never send an inquiry — only the
  user's tap on the card does). It won't negotiate prices or bookings, keeps
  replies short, and answers in Sinhala when the locale is `si`.
- **Session-gated & rate-limited.** The web proxy requires a signed-in session
  (401 otherwise) and enforces a per-user sliding window of **15 requests / 60 s**
  (429 on exceed). The in-memory window map is swept of aged-out users (mirroring
  the gateway limiter) so it can't grow unbounded over the process lifetime.

---

