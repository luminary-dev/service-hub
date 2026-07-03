import { jwtVerify } from "jose";
import { cookies } from "next/headers";

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
// AUTH_SECRET.
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
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
