import { jwtVerify } from "jose";

if (!process.env.AUTH_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("AUTH_SECRET must be set in production");
}

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-only-secret"
);

export const SESSION_COOKIE = "sh_session";

export type SessionPayload = {
  userId: string;
  role: string;
  name: string;
  // User.sessionVersion at mint time; tokens minted before a bump (password
  // change/reset, logout-everywhere) are revoked. Tokens from before this
  // scheme carry no sv and count as version 0.
  sv: number;
};

// Verifies the sh_session JWT (HS256, signed by identity-service). Invalid or
// expired tokens yield null — the gateway forwards without identity headers
// and the services decide their own 401s.
export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
    return {
      userId: payload.userId as string,
      role: payload.role as string,
      name: payload.name as string,
      sv: typeof payload.sv === "number" ? payload.sv : 0,
    };
  } catch {
    return null;
  }
}

// Admin impersonation ("view as", #234) — a distinct, short-lived (15m)
// cookie signed by identity-service, kept separate from sh_session so it
// never clobbers the admin's own session. See identity-service's
// lib/session.ts for how it's minted.
export const IMPERSONATION_COOKIE = "impersonation_session";

export type ImpersonationPayload = SessionPayload & {
  // The admin userId that started the impersonation — required on every
  // impersonation token so it can never be confused with a real session.
  impersonatedBy: string;
  // The admin's sessionVersion at mint time (#358); checked against the admin's
  // current version so revoking the admin's sessions kills active impersonation.
  impersonatedBySv: number;
};

// Same verification as verifySessionToken, plus: a token missing
// `impersonatedBy` is not treated as a valid impersonation token even if it
// is otherwise a validly-signed sh_session-shaped JWT.
export async function verifyImpersonationToken(
  token: string
): Promise<ImpersonationPayload | null> {
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
      impersonatedBySv:
        typeof payload.impersonatedBySv === "number"
          ? payload.impersonatedBySv
          : 0,
    };
  } catch {
    return null;
  }
}
