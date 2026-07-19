// Mobile push via FCM (#798). Deliberately dependency-light: no firebase-admin
// — the OAuth2 JWT-grant flow is a signed RS256 JWT (jose, already used by
// identity/gateway) exchanged at Google's token endpoint, and sends are plain
// HTTPS POSTs to the FCM v1 API. Fail-soft posture copied from email.ts: with
// FCM_PROJECT_ID / FCM_SERVICE_ACCOUNT unset every push path is a no-op (one
// startup log line, see initPush) — push must never fail event ingestion.
import { importPKCS8, SignJWT } from "jose";
import { db } from "../db";
import { coerceLocale, type NotificationType } from "./events";
import { renderEventPush } from "./event-push";
import { log } from "./log";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
// Refresh the cached access token this long before it actually expires, so an
// in-flight batch never sends with a token that dies mid-loop.
const TOKEN_REFRESH_MARGIN_MS = 60_000;

type FcmConfig = { projectId: string; clientEmail: string; privateKey: string };

// FCM_SERVICE_ACCOUNT is the service-account JSON, raw or base64-encoded
// (base64 survives dotenv/CI quoting better; detect by the leading "{").
// Malformed config logs once and disables push rather than crash-looping.
function loadConfig(): FcmConfig | null {
  const projectId = process.env.FCM_PROJECT_ID;
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!projectId || !raw) return null;
  try {
    const text = raw.trimStart().startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(text) as { client_email?: string; private_key?: string };
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("service account JSON is missing client_email/private_key");
    }
    return { projectId, clientEmail: parsed.client_email, privateKey: parsed.private_key };
  } catch (err) {
    log.error("FCM_SERVICE_ACCOUNT is set but unusable — push disabled", { err });
    return null;
  }
}

// undefined = not parsed yet; null = unset/unusable (push disabled).
let config: FcmConfig | null | undefined;

function getConfig(): FcmConfig | null {
  if (config !== undefined) return config;
  config = loadConfig();
  return config;
}

export function pushEnabled(): boolean {
  return getConfig() !== null;
}

// One startup log line (called from index.ts), mirroring startEmailWorker's
// REDIS_URL line — so the deploy log states plainly which mode this is.
export function initPush(): void {
  const cfg = getConfig();
  if (cfg) {
    log.info("FCM push enabled", { projectId: cfg.projectId });
  } else {
    log.info("FCM_PROJECT_ID/FCM_SERVICE_ACCOUNT not set — mobile push disabled, delivery is a no-op");
  }
}

// Test-only: re-read env + drop the cached access token between cases.
export function resetPushForTests(): void {
  config = undefined;
  cachedToken = null;
}

// ---------------------------------------------------------------------------
// OAuth2 JWT grant (RFC 7523): RS256-sign an assertion with the service
// account's private key, exchange it for a ~1h access token, cache until
// shortly before expiry.
// ---------------------------------------------------------------------------

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(cfg: FcmConfig, now: number = Date.now()): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - TOKEN_REFRESH_MARGIN_MS > now) {
    return cachedToken.value;
  }
  const key = await importPKCS8(cfg.privateKey, "RS256");
  const assertion = await new SignJWT({ scope: FCM_SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(cfg.clientEmail)
    .setAudience(TOKEN_ENDPOINT)
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor(now / 1000) + 3600)
    .sign(key);
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    void res.body?.cancel().catch(() => {});
    throw new Error(`FCM token exchange failed: ${res.status}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return data.access_token;
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export type PushNotification = { title: string; body: string; link: string };

// One FCM v1 send per token. Never throws: a failed token exchange skips the
// batch with one log line, per-token failures log and continue, and a token
// FCM reports gone (HTTP 404 / UNREGISTERED) is pruned from DeviceToken so it
// is never addressed again. No-op when push is unconfigured.
export async function sendPush(
  tokens: string[],
  notification: PushNotification
): Promise<void> {
  const cfg = getConfig();
  if (!cfg || tokens.length === 0) return;

  let accessToken: string;
  try {
    accessToken = await getAccessToken(cfg);
  } catch (err) {
    log.error("FCM token exchange failed — skipping push batch", { err });
    return;
  }

  for (const token of tokens) {
    try {
      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: notification.title, body: notification.body },
              data: { link: notification.link },
            },
          }),
          signal: AbortSignal.timeout(10_000),
        }
      );
      if (res.ok) {
        void res.body?.cancel().catch(() => {});
        continue;
      }
      const text = await res.text().catch(() => "");
      // Token gone: the app was uninstalled or the registration rotated. FCM
      // signals it as HTTP 404 / error UNREGISTERED — prune the row so dead
      // tokens don't accumulate against the per-user cap.
      if (res.status === 404 || text.includes("UNREGISTERED")) {
        await db.deviceToken.deleteMany({ where: { token } });
        continue;
      }
      log.error("FCM send failed", { status: res.status });
    } catch (err) {
      log.error("FCM send failed", { err });
    }
  }
}

// ---------------------------------------------------------------------------
// Queue-job delivery (lib/queue.ts dispatches kind:"push" entries here)
// ---------------------------------------------------------------------------

// One queue job per recipient, carrying that user's device tokens (looked up
// at ingestion, off the 202 hot path — see routes/events.ts).
export type PushJob = {
  kind: "push";
  type: NotificationType;
  tokens: string[];
  locale: "en" | "si";
  payload: Record<string, unknown>;
  // Absolute URL, rebuilt from the gateway's x-origin at ingestion time (same
  // convention as EmailJob.link).
  link: string;
};

// Render + send one job. One-shot best-effort: sendPush never throws, and the
// outer try/catch guards rendering against malformed legacy jobs (the email
// worker's posture) — so the queue never retries push.
export async function deliverPushJob(job: PushJob): Promise<void> {
  try {
    const rendered = renderEventPush(job.type, job.payload, coerceLocale(job.locale));
    await sendPush(job.tokens, { ...rendered, link: job.link });
  } catch (err) {
    log.error("push job failed — dropping", { type: job.type, err });
  }
}
