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

export type SessionPayload = {
  userId: string;
  role: string;
  name: string;
};

// Read-only session check for page gating. The session cookie is signed by
// identity-service and verified here (and by the gateway) with the shared
// AUTH_SECRET. Verification mirrors the gateway's hardened path so UI gating
// and data access agree: the HS256 algorithm is pinned (blocking algorithm-
// confusion attacks), and the token's session version is checked against
// identity so a role change / password reset / logout-everywhere takes effect
// in the UI, not just at the gateway.
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
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
    };
  } catch {
    return null;
  }
}
