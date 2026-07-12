// Port of the monolith's src/lib/auth.ts createSession/destroySession.
// identity-service is the ONLY signer of the sh_session JWT; the gateway and
// the web app verify it.
import { SignJWT, jwtVerify } from "jose";
import type { Context } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";

if (!process.env.AUTH_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("AUTH_SECRET must be set in production");
}

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-only-secret"
);

export const COOKIE_NAME = "sh_session";

export type SessionPayload = {
  userId: string;
  role: string;
  name: string;
  // User.sessionVersion at mint time. Verifiers reject tokens minted before
  // the user's current version (revocation on password change / logout-all).
  sv: number;
  // Profile photo (#434 follow-up) so the top-nav avatar renders without a
  // per-page /me fetch. Optional: absent tokens (or users with no photo) just
  // fall back to initials. Re-minted on every avatar change so it stays fresh.
  avatar?: string | null;
};

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function createSession(c: Context, payload: SessionPayload) {
  const token = await signSession(payload);
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
}

export function destroySession(c: Context) {
  deleteCookie(c, COOKIE_NAME, { path: "/" });
}

// ---------------------------------------------------------------------------
// Impersonation sessions (admin "view as" — #234).
//
// A distinct cookie from sh_session so starting/ending impersonation never
// clobbers the admin's own session. The payload carries `impersonatedBy` (the
// admin's userId), which makes the token unmistakably an impersonation token
// — the gateway forwards it as x-impersonated-by, and anything inspecting the
// JWT directly can tell it apart from a real session. Always short-lived
// (15m) regardless of the normal 7-day session TTL.
// ---------------------------------------------------------------------------
export const IMPERSONATION_COOKIE_NAME = "impersonation_session";
export const IMPERSONATION_TTL_SECONDS = 15 * 60;

export type ImpersonationPayload = SessionPayload & {
  impersonatedBy: string;
};

export async function signImpersonationSession(
  payload: ImpersonationPayload
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${IMPERSONATION_TTL_SECONDS}s`)
    .sign(secret);
}

export async function createImpersonationSession(
  c: Context,
  payload: ImpersonationPayload
) {
  const token = await signImpersonationSession(payload);
  setCookie(c, IMPERSONATION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: IMPERSONATION_TTL_SECONDS,
    path: "/",
  });
}

export function destroyImpersonationSession(c: Context) {
  deleteCookie(c, IMPERSONATION_COOKIE_NAME, { path: "/" });
}

// Reads and verifies the impersonation cookie directly off the incoming
// request. The Cookie header passes through the gateway unmodified (same as
// sh_session), so this works the same way createSession/destroySession do.
// Used by the "end impersonation" route, which needs to know which
// admin/target pair to close out in the log — that context lives only in
// this token, not in the x-user-* identity headers the gateway forwards.
export async function readImpersonationSession(
  c: Context
): Promise<ImpersonationPayload | null> {
  const token = getCookie(c, IMPERSONATION_COOKIE_NAME);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
    if (typeof payload.impersonatedBy !== "string") return null;
    return {
      userId: payload.userId as string,
      role: payload.role as string,
      name: payload.name as string,
      sv: typeof payload.sv === "number" ? payload.sv : 0,
      impersonatedBy: payload.impersonatedBy,
    };
  } catch {
    return null;
  }
}
