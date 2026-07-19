import { Hono } from "hono";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import { generateState, generateCodeVerifier } from "arctic";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { getOrigin } from "../lib/http";
import { log } from "../lib/log";
import { createSession } from "../lib/session";
import { issueTokenPair } from "../lib/issue-tokens";
import { getAdapter } from "../lib/oauth";
import { isLockedOut } from "../lib/lockout";

export const oauthRoutes = new Hono();

const STATE_COOKIE = "oauth_state";
const VERIFIER_COOKIE = "oauth_verifier";
const NEXT_COOKIE = "oauth_next";
// Remembers a mobile flow so the callback returns tokens to the app's deep
// link (#398 mobile) instead of setting a cookie + web redirect.
const MOBILE_COOKIE = "oauth_mobile";
const TEN_MINUTES = 60 * 10;

// The mobile app's registered custom scheme (see mobile/, OAuthFlow). Only this
// exact scheme may receive tokens — never an arbitrary redirect, which would
// leak the session to any app that intercepts it.
const MOBILE_SCHEME = "baaslk://";

// Only same-origin relative paths survive as a post-login destination — never a
// scheme/host (open-redirect) or a protocol-relative "//evil.com".
function sanitizeNext(next: string | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

// A mobile deep-link redirect is accepted only when it is exactly the app's
// registered scheme — token handoff must never target an arbitrary URL.
function sanitizeMobileRedirect(redirect: string | undefined): string | null {
  if (!redirect || !redirect.startsWith(MOBILE_SCHEME)) return null;
  return redirect;
}

// `Secure` is keyed to the actual serving protocol, not NODE_ENV: over https
// (prod) the transient cookies must be Secure, but a Secure cookie set over
// plain http (local dev, and the mobile app's `http://localhost` web-auth
// session) is dropped by strict clients — which broke mobile social login
// because the callback then never saw the state/verifier/mobile cookies. The
// origin already carries the protocol (getOrigin → x-origin / WEB_ORIGIN).
function transientCookie(
  c: Parameters<typeof setCookie>[0],
  name: string,
  value: string,
  secure: boolean,
) {
  setCookie(c, name, value, {
    httpOnly: true,
    sameSite: "Lax", // Lax so the cookie rides the top-level GET redirect back from the provider.
    secure,
    path: "/",
    maxAge: TEN_MINUTES,
  });
}

function clearTransientCookies(c: Parameters<typeof deleteCookie>[0]) {
  for (const name of [STATE_COOKIE, VERIFIER_COOKIE, NEXT_COOKIE, MOBILE_COOKIE]) {
    deleteCookie(c, name, { path: "/" });
  }
}

// ---------------------------------------------------------------------------
// GET /api/auth/oauth/:provider/start
// ---------------------------------------------------------------------------
oauthRoutes.get("/oauth/:provider/start", (c) => {
  const origin = getOrigin(c);
  const provider = c.req.param("provider");
  const adapter = getAdapter(provider);
  if (!adapter || !adapter.isConfigured()) {
    return c.redirect(`${origin}/login?error=oauth_unavailable`);
  }

  const state = generateState();
  // Always minted + stored; providers that use PKCE (Google) consume it, others
  // (Facebook) ignore it.
  const codeVerifier = generateCodeVerifier();
  const next = sanitizeNext(c.req.query("next"));
  // Mobile clients pass `client=mobile` + a `redirect` deep link; remember it so
  // the callback hands back tokens instead of a cookie.
  const mobileRedirect =
    c.req.query("client") === "mobile"
      ? sanitizeMobileRedirect(c.req.query("redirect"))
      : null;

  const secure = origin.startsWith("https:");
  transientCookie(c, STATE_COOKIE, state, secure);
  transientCookie(c, VERIFIER_COOKIE, codeVerifier, secure);
  if (next) transientCookie(c, NEXT_COOKIE, next, secure);
  if (mobileRedirect) transientCookie(c, MOBILE_COOKIE, mobileRedirect, secure);

  const url = adapter.createAuthorizationURL(origin, state, codeVerifier);
  return c.redirect(url.toString());
});

// ---------------------------------------------------------------------------
// GET /api/auth/oauth/:provider/callback
// ---------------------------------------------------------------------------
oauthRoutes.get("/oauth/:provider/callback", async (c) => {
  const origin = getOrigin(c);
  // A mobile flow (start stored the app's deep link) returns to the app; the
  // web flow returns to /login. Read it before any clearTransientCookies call.
  const mobileRedirect = sanitizeMobileRedirect(getCookie(c, MOBILE_COOKIE));
  const fail = (reason: string) => {
    clearTransientCookies(c);
    return c.redirect(
      mobileRedirect
        ? `${mobileRedirect}?error=${reason}`
        : `${origin}/login?error=${reason}`
    );
  };

  const provider = c.req.param("provider");
  const adapter = getAdapter(provider);
  if (!adapter || !adapter.isConfigured()) {
    return fail("oauth_unavailable");
  }

  // The user declined consent (or the provider bounced them back): Google sends
  // ?error=access_denied and no code. That's a cancel, not a failure — return
  // quietly with no error banner (#431).
  if (c.req.query("error")) {
    clearTransientCookies(c);
    return c.redirect(
      mobileRedirect ? `${mobileRedirect}?error=cancelled` : `${origin}/login`
    );
  }

  const code = c.req.query("code");
  const state = c.req.query("state");
  const storedState = getCookie(c, STATE_COOKIE);
  const codeVerifier = getCookie(c, VERIFIER_COOKIE);
  const next = sanitizeNext(getCookie(c, NEXT_COOKIE));

  // Missing params or a state mismatch means this isn't a callback we started.
  if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
    return fail("oauth");
  }

  let identity;
  try {
    identity = await adapter.fetchIdentity(origin, code, codeVerifier);
  } catch (e) {
    log.error("oauth code exchange failed", { context: "oauth", provider, err: e });
    return fail("oauth");
  }

  let isNew = false;
  let user;
  try {
    // 1. Already-linked identity → sign in (works even without an email).
    const existingAccount = await db.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId: identity.providerAccountId,
        },
      },
      include: { user: true },
    });

    if (existingAccount) {
      user = existingAccount.user;
    } else if (identity.email) {
      // 2. The provider returned an email. Whether it may CLAIM a pre-existing
      // account depends on whether the provider vouched for it.
      const email = identity.email.toLowerCase();
      const existingUser = await db.user.findUnique({ where: { email } });
      if (existingUser) {
        // Auto-linking claims an account the person may not actually control,
        // so it is gated on a provider-VERIFIED email (#635). Google supplies an
        // explicit email_verified claim; Facebook exposes no verification signal
        // (see lib/oauth.ts), so a Facebook-returned address is unverified and
        // must NOT silently link to an existing (typically password) account —
        // that was an account-takeover vector. Refuse and steer them to sign in
        // with their existing method; they can add Facebook later once we can
        // trust the address (a confirm-to-link flow is a tracked follow-up).
        if (!identity.emailVerified) {
          return fail("oauth_email");
        }
        await db.account
          .create({
            data: { userId: existingUser.id, provider, providerAccountId: identity.providerAccountId },
          })
          .catch((e: unknown) => {
            // A concurrent callback linked it first — fine, ignore the dup.
            if (
              !(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
            ) {
              throw e;
            }
          });
        user = existingUser;
      } else {
        // No collision → create a fresh account from the real address. It keeps
        // that email so the user isn't stuck on a placeholder, but the address
        // is only stamped emailVerified when the provider vouched for it
        // (Google). An unverified email (Facebook) creates the account with
        // emailVerified null; the user can confirm it later via change-email
        // (#396). Either way this claims no existing account.
        isNew = true;
        user = await db.$transaction(async (tx) => {
          const created = await tx.user.create({
            data: {
              email,
              passwordHash: null,
              name: identity.name?.slice(0, 80) || email.split("@")[0],
              role: "CUSTOMER",
              emailVerified: identity.emailVerified ? new Date() : null,
            },
          });
          await tx.account.create({
            data: { userId: created.id, provider, providerAccountId: identity.providerAccountId },
          });
          return created;
        });
      }
    } else {
      // 3. No usable email (e.g. a Facebook account that shared none). Rather
      // than block, create a CUSTOMER keyed on the provider id with a
      // non-deliverable placeholder email (never verified). The user can attach
      // a real email later via the change-email flow (#396). Such an account is
      // never auto-linked to a real email.
      isNew = true;
      const placeholderEmail = `${provider}-${identity.providerAccountId}@placeholder.baas.lk`;
      user = await db.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: placeholderEmail,
            passwordHash: null,
            name: identity.name?.slice(0, 80) || "New user",
            role: "CUSTOMER",
            emailVerified: null,
          },
        });
        await tx.account.create({
          data: { userId: created.id, provider, providerAccountId: identity.providerAccountId },
        });
        return created;
      });
    }
  } catch (e) {
    log.error("oauth user resolution failed", { context: "oauth", provider, err: e });
    return fail("oauth");
  }

  // Honor the per-account lockout password login enforces (auth.ts) — a social
  // sign-in must not mint a session for a locked account (#641). The same
  // `lockedUntil` column backs both the failed-login window and an admin lock,
  // so this covers both. All resolution branches above (linked account /
  // verified-email link / new signup / no-email placeholder) converge here, so
  // no path can slip past the gate. A brand-new signup is never locked.
  if (isLockedOut(user.lockedUntil)) {
    clearTransientCookies(c);
    return c.redirect(
      mobileRedirect
        ? `${mobileRedirect}?error=oauth_locked`
        : `${origin}/login?error=oauth_locked`
    );
  }

  // Mobile: hand the app a Bearer session (access + refresh) via the deep link
  // — no cookie. The token pair is identical to POST /api/auth/token.
  if (mobileRedirect) {
    const { accessToken, refreshToken, expiresIn } = await issueTokenPair(
      user,
      "mobile"
    );
    clearTransientCookies(c);
    const params = new URLSearchParams({
      accessToken,
      refreshToken,
      expiresIn: String(expiresIn),
    });
    return c.redirect(`${mobileRedirect}?${params.toString()}`);
  }

  await createSession(c, {
    userId: user.id,
    role: user.role,
    name: user.name,
    sv: user.sessionVersion,
    avatar: user.avatarUrl,
  });
  clearTransientCookies(c);

  // New users choose customer-vs-provider; returning users go where they were
  // headed (or home). Both are same-origin relative paths.
  const destination = isNew ? "/welcome" : next ?? "/";
  return c.redirect(`${origin}${destination}`);
});
