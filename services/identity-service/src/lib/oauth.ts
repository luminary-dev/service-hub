// Social login plumbing (#398). identity-service stays the sole minter of the
// sh_session JWT: OAuth here only resolves a verified identity, then the route
// upserts the user and calls createSession like every other auth path.
import { Google } from "arctic";
import { decodeJwt } from "jose";

// Google is the only provider in the first cut; Facebook is a fast follow-up
// (arctic ships a `Facebook` client with the same shape).
export const OAUTH_PROVIDERS = ["google"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export function isOAuthProvider(v: string): v is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(v);
}

// OpenID scopes — `openid email profile` yields sub / email / email_verified /
// name in the id_token, so we never need a second userinfo round-trip.
export const GOOGLE_SCOPES = ["openid", "email", "profile"];

export function isGoogleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );
}

// The redirect URI must byte-match what's registered in the Google console.
// Derived from the public web origin so dev (localhost:3000) and prod (baas.lk)
// both work off one registration each.
export function googleRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/auth/oauth/google/callback`;
}

export function getGoogleClient(origin: string): Google {
  return new Google(
    process.env.GOOGLE_CLIENT_ID as string,
    process.env.GOOGLE_CLIENT_SECRET as string,
    googleRedirectUri(origin)
  );
}

export type OAuthIdentity = {
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
};

// Google returns a signed id_token from its token endpoint over TLS; arctic has
// already completed the code exchange, so decoding (not re-verifying) the
// claims is the standard, safe way to read the subject/email here.
export function parseGoogleIdToken(idToken: string): OAuthIdentity {
  const claims = decodeJwt(idToken);
  const emailVerified =
    claims.email_verified === true || claims.email_verified === "true";
  return {
    providerAccountId: String(claims.sub),
    email: typeof claims.email === "string" ? claims.email : null,
    emailVerified,
    name: typeof claims.name === "string" ? claims.name : null,
  };
}
