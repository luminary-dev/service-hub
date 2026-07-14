// Social login plumbing (#398). identity-service stays the sole minter of the
// sh_session JWT: an OAuth adapter only resolves a verified identity, then the
// route upserts the user and calls createSession like every other auth path.
//
// Providers differ enough that each is a small adapter behind one interface:
// Google uses PKCE + an OIDC id_token; Facebook uses no PKCE and a Graph-API
// profile lookup. The route code stays provider-agnostic.
import { Google, Facebook } from "arctic";
import { decodeJwt } from "jose";

export const OAUTH_PROVIDERS = ["google", "facebook"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export type OAuthIdentity = {
  providerAccountId: string;
  email: string | null;
  // Whether we trust the email enough to auto-link it to an existing account.
  emailVerified: boolean;
  name: string | null;
};

export type OAuthAdapter = {
  // Both client credentials present → the provider button is live.
  isConfigured(): boolean;
  // Google needs the PKCE verifier; Facebook ignores it.
  createAuthorizationURL(origin: string, state: string, codeVerifier: string): URL;
  fetchIdentity(
    origin: string,
    code: string,
    codeVerifier: string
  ): Promise<OAuthIdentity>;
};

function callbackUri(origin: string, provider: OAuthProvider): string {
  return `${origin.replace(/\/$/, "")}/api/auth/oauth/${provider}/callback`;
}

// Google returns a signed id_token from its token endpoint over TLS; arctic has
// already completed the code exchange, so decoding (not re-verifying) the
// claims is the standard, safe way to read subject/email here.
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

const google: OAuthAdapter = {
  isConfigured: () =>
    Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  createAuthorizationURL: (origin, state, codeVerifier) =>
    new Google(
      process.env.GOOGLE_CLIENT_ID as string,
      process.env.GOOGLE_CLIENT_SECRET as string,
      callbackUri(origin, "google")
    ).createAuthorizationURL(state, codeVerifier, ["openid", "email", "profile"]),
  fetchIdentity: async (origin, code, codeVerifier) => {
    const tokens = await new Google(
      process.env.GOOGLE_CLIENT_ID as string,
      process.env.GOOGLE_CLIENT_SECRET as string,
      callbackUri(origin, "google")
    ).validateAuthorizationCode(code, codeVerifier);
    return parseGoogleIdToken(tokens.idToken());
  },
};

const facebook: OAuthAdapter = {
  isConfigured: () =>
    Boolean(
      process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET
    ),
  // Facebook doesn't use PKCE — the verifier is accepted for a uniform route
  // signature but ignored.
  createAuthorizationURL: (origin, state) =>
    new Facebook(
      process.env.FACEBOOK_CLIENT_ID as string,
      process.env.FACEBOOK_CLIENT_SECRET as string,
      callbackUri(origin, "facebook")
    ).createAuthorizationURL(state, ["email", "public_profile"]),
  fetchIdentity: async (origin, code) => {
    const tokens = await new Facebook(
      process.env.FACEBOOK_CLIENT_ID as string,
      process.env.FACEBOOK_CLIENT_SECRET as string,
      callbackUri(origin, "facebook")
    ).validateAuthorizationCode(code);
    // Facebook has no id_token; read the profile from the Graph API. `email`
    // may be absent (the user has none, or denied the permission).
    const res = await fetch(
      `https://graph.facebook.com/me?fields=id,name,email&access_token=${encodeURIComponent(
        tokens.accessToken()
      )}`
    );
    if (!res.ok) {
      throw new Error(`facebook graph lookup failed: ${res.status}`);
    }
    const data = (await res.json()) as {
      id: string;
      name?: string;
      email?: string;
    };
    return {
      providerAccountId: String(data.id),
      email: typeof data.email === "string" ? data.email : null,
      // Facebook's Graph API exposes NO per-request email-verification signal —
      // an address here is merely one on file, which is not proof the person
      // signing in controls it. Treating mere presence as "verified" let a
      // Facebook account with a victim's email auto-claim the victim's existing
      // password account (#635, account takeover). So Facebook emails are always
      // UNVERIFIED for the purpose of auto-linking: the callback creates a new
      // account from the address but never links it to a pre-existing one.
      // (Google, by contrast, supplies an explicit email_verified claim.)
      emailVerified: false,
      name: typeof data.name === "string" ? data.name : null,
    };
  },
};

const ADAPTERS: Record<OAuthProvider, OAuthAdapter> = { google, facebook };

export function getAdapter(name: string): OAuthAdapter | null {
  return (OAUTH_PROVIDERS as readonly string[]).includes(name)
    ? ADAPTERS[name as OAuthProvider]
    : null;
}
