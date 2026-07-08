import { Hono } from "hono";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import { generateState, generateCodeVerifier } from "arctic";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { getOrigin } from "../lib/http";
import { log } from "../lib/log";
import { createSession } from "../lib/session";
import {
  GOOGLE_SCOPES,
  getGoogleClient,
  isGoogleConfigured,
  isOAuthProvider,
  parseGoogleIdToken,
} from "../lib/oauth";

export const oauthRoutes = new Hono();

const STATE_COOKIE = "oauth_state";
const VERIFIER_COOKIE = "oauth_verifier";
const NEXT_COOKIE = "oauth_next";
const TEN_MINUTES = 60 * 10;

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

// Only same-origin relative paths survive as a post-login destination — never a
// scheme/host (open-redirect) or a protocol-relative "//evil.com".
function sanitizeNext(next: string | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

function transientCookie(c: Parameters<typeof setCookie>[0], name: string, value: string) {
  setCookie(c, name, value, {
    httpOnly: true,
    sameSite: "Lax", // Lax so the cookie rides the top-level GET redirect back from Google.
    secure: isProd(),
    path: "/",
    maxAge: TEN_MINUTES,
  });
}

function clearTransientCookies(c: Parameters<typeof deleteCookie>[0]) {
  for (const name of [STATE_COOKIE, VERIFIER_COOKIE, NEXT_COOKIE]) {
    deleteCookie(c, name, { path: "/" });
  }
}

// ---------------------------------------------------------------------------
// GET /api/auth/oauth/:provider/start
// ---------------------------------------------------------------------------
oauthRoutes.get("/oauth/:provider/start", (c) => {
  const origin = getOrigin(c);
  const provider = c.req.param("provider");
  if (!isOAuthProvider(provider) || !isGoogleConfigured()) {
    return c.redirect(`${origin}/login?error=oauth_unavailable`);
  }

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const next = sanitizeNext(c.req.query("next"));

  transientCookie(c, STATE_COOKIE, state);
  transientCookie(c, VERIFIER_COOKIE, codeVerifier);
  if (next) transientCookie(c, NEXT_COOKIE, next);

  const url = getGoogleClient(origin).createAuthorizationURL(
    state,
    codeVerifier,
    GOOGLE_SCOPES
  );
  return c.redirect(url.toString());
});

// ---------------------------------------------------------------------------
// GET /api/auth/oauth/:provider/callback
// ---------------------------------------------------------------------------
oauthRoutes.get("/oauth/:provider/callback", async (c) => {
  const origin = getOrigin(c);
  const fail = (reason: string) => {
    clearTransientCookies(c);
    return c.redirect(`${origin}/login?error=${reason}`);
  };

  const provider = c.req.param("provider");
  if (!isOAuthProvider(provider) || !isGoogleConfigured()) {
    return fail("oauth_unavailable");
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
    const tokens = await getGoogleClient(origin).validateAuthorizationCode(
      code,
      codeVerifier
    );
    identity = parseGoogleIdToken(tokens.idToken());
  } catch (e) {
    log.error("oauth code exchange failed", { context: "oauth", err: e });
    return fail("oauth");
  }

  // Auto-link only on a verified email (Google always verifies); never trust an
  // unverified address to claim an existing account.
  if (!identity.email || !identity.emailVerified) {
    return fail("oauth_email");
  }
  const email = identity.email.toLowerCase();

  let isNew = false;
  let user;
  try {
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
    } else {
      const existingUser = await db.user.findUnique({ where: { email } });
      if (existingUser) {
        // Link the social identity to the pre-existing (verified-email) account.
        await db.account
          .create({
            data: {
              userId: existingUser.id,
              provider,
              providerAccountId: identity.providerAccountId,
            },
          })
          .catch((e: unknown) => {
            // A concurrent callback linked it first — fine, ignore the dup.
            if (
              !(
                e instanceof Prisma.PrismaClientKnownRequestError &&
                e.code === "P2002"
              )
            ) {
              throw e;
            }
          });
        user = existingUser;
      } else {
        // Brand-new signup. Role defaults to CUSTOMER; the /welcome chooser
        // lets them convert to a provider next. Email is pre-verified by Google.
        isNew = true;
        user = await db.$transaction(async (tx) => {
          const created = await tx.user.create({
            data: {
              email,
              passwordHash: null,
              name: identity.name?.slice(0, 80) || email.split("@")[0],
              role: "CUSTOMER",
              emailVerified: new Date(),
            },
          });
          await tx.account.create({
            data: {
              userId: created.id,
              provider,
              providerAccountId: identity.providerAccountId,
            },
          });
          return created;
        });
      }
    }
  } catch (e) {
    log.error("oauth user resolution failed", { context: "oauth", err: e });
    return fail("oauth");
  }

  await createSession(c, {
    userId: user.id,
    role: user.role,
    name: user.name,
    sv: user.sessionVersion,
  });
  clearTransientCookies(c);

  // New users choose customer-vs-provider; returning users go where they were
  // headed (or home). Both are same-origin relative paths.
  const destination = isNew ? "/welcome" : next ?? "/";
  return c.redirect(`${origin}${destination}`);
});
