import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { sessionVersionOk } from "./session-version";

if (!process.env.AUTH_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("AUTH_SECRET must be set in production");
}

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-only-secret"
);

const COOKIE_NAME = "sh_session";

// Admin impersonation ("view as", #234) — a distinct, short-lived cookie
// signed by identity-service (see its lib/session.ts). Kept separate from
// sh_session so it never clobbers the admin's own session.
const IMPERSONATION_COOKIE_NAME = "impersonation_session";

export type SessionPayload = {
  userId: string;
  role: string;
  name: string;
  // Profile photo carried in the JWT (#434 follow-up) so the top-nav avatar
  // renders without a per-page /me fetch. Absent → fall back to initials.
  avatar?: string | null;
  // Set only when the active session is an impersonation session; holds the
  // admin userId that started it. Absent for a normal sh_session.
  impersonatedBy?: string;
};

// Read-only session check for page gating. The session cookie is signed by
// identity-service and verified here (and by the gateway) with the shared
// AUTH_SECRET. Verification mirrors the gateway's hardened path so UI gating
// and data access agree: the HS256 algorithm is pinned (blocking algorithm-
// confusion attacks), and the token's session version is checked against
// identity so a role change / password reset / logout-everywhere takes effect
// in the UI, not just at the gateway.
//
// A valid impersonation cookie takes priority over sh_session, mirroring the
// gateway's proxy behavior — while impersonating, server-rendered pages see
// the target user's identity, with impersonatedBy set so callers (e.g. the
// site-wide banner) can tell the difference. The impersonation token is
// verified with the same pinned HS256 algorithm.
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();

  const impersonationToken = cookieStore.get(IMPERSONATION_COOKIE_NAME)?.value;
  if (impersonationToken) {
    try {
      const { payload } = await jwtVerify(impersonationToken, secret, {
        algorithms: ["HS256"],
      });
      if (typeof payload.impersonatedBy === "string") {
        const targetSv = typeof payload.sv === "number" ? payload.sv : 0;
        const adminSv =
          typeof payload.impersonatedBySv === "number"
            ? payload.impersonatedBySv
            : 0;
        // Revocation, mirroring the gateway (#358): both the impersonated
        // target AND the impersonating admin must still have a current session
        // version. If the admin was force-logged-out / reset their password,
        // the impersonation is dead — fall through to the admin's own
        // sh_session (which, if also revoked, then yields no session).
        if (
          (await sessionVersionOk(payload.userId as string, targetSv)) &&
          (await sessionVersionOk(payload.impersonatedBy, adminSv))
        ) {
          return {
            userId: payload.userId as string,
            role: payload.role as string,
            name: payload.name as string,
            impersonatedBy: payload.impersonatedBy,
          };
        }
      }
    } catch {
      // Invalid/expired impersonation cookie — fall through to sh_session.
    }
  }

  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionJwt(token);
}

// Bearer-token variant for API clients (the mobile app, #797/#801). The
// mobile app authenticates with `Authorization: Bearer <access-jwt>` instead
// of the sh_session cookie; the token is the same identity-signed JWT, so
// verification and sessionVersion revocation are identical. Impersonation is
// deliberately cookie-only — a Bearer token can never carry an impersonated
// identity.
export async function getBearerSession(
  authorization: string | null
): Promise<SessionPayload | null> {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return verifySessionJwt(token);
}

async function verifySessionJwt(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
    const userId = payload.userId as string;
    const sv = typeof payload.sv === "number" ? payload.sv : 0;
    // Revocation check (cached, fails open on identity outage).
    if (!(await sessionVersionOk(userId, sv))) return null;
    return {
      userId,
      role: payload.role as string,
      name: payload.name as string,
      avatar: typeof payload.avatar === "string" ? payload.avatar : null,
    };
  } catch {
    return null;
  }
}
