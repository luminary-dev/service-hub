// Port of the monolith's src/lib/auth.ts createSession/destroySession.
// identity-service is the ONLY signer of the sh_session JWT; the gateway and
// the web app verify it.
import { SignJWT } from "jose";
import type { Context } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";

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
