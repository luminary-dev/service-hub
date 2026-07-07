import { jwtVerify } from "jose";
import { cookies } from "next/headers";

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
  // Set only when the active session is an impersonation session; holds the
  // admin userId that started it. Absent for a normal sh_session.
  impersonatedBy?: string;
};

// Read-only session check for page gating. The session cookie is signed by
// identity-service and verified here (and by the gateway) with the shared
// AUTH_SECRET.
//
// A valid impersonation cookie takes priority over sh_session, mirroring the
// gateway's proxy behavior — while impersonating, server-rendered pages see
// the target user's identity, with impersonatedBy set so callers (e.g. the
// site-wide banner) can tell the difference.
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();

  const impersonationToken = cookieStore.get(IMPERSONATION_COOKIE_NAME)?.value;
  if (impersonationToken) {
    try {
      const { payload } = await jwtVerify(impersonationToken, secret, {
        algorithms: ["HS256"],
      });
      if (typeof payload.impersonatedBy === "string") {
        return {
          userId: payload.userId as string,
          role: payload.role as string,
          name: payload.name as string,
          impersonatedBy: payload.impersonatedBy,
        };
      }
    } catch {
      // Invalid/expired impersonation cookie — fall through to sh_session.
    }
  }

  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      userId: payload.userId as string,
      role: payload.role as string,
      name: payload.name as string,
    };
  } catch {
    return null;
  }
}
