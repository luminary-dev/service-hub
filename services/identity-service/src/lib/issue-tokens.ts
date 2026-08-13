import { type User } from "@prisma/client";
import { db } from "../db";
import { ACCESS_TOKEN_TTL_SECONDS, signSession } from "./session";
import { createToken, REFRESH_TOKEN_TTL_MS } from "./tokens";

/**
 * Mints a short-lived access JWT + a persisted rotating refresh token for a
 * user — the API-client (mobile) session pair. Shared by `POST /api/auth/token`
 * and the OAuth callback's mobile branch so there's one issuance path. The raw
 * refresh token is returned once (only time it exists outside the client);
 * only its hash is stored.
 */
export async function issueTokenPair(
  user: User,
  deviceName: string | null
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const accessToken = await signSession(
    {
      userId: user.id,
      role: user.role,
      name: user.name,
      sv: user.sessionVersion,
      avatar: user.avatarUrl,
    },
    `${ACCESS_TOKEN_TTL_SECONDS}s`
  );
  const { raw, hash } = createToken();
  await db.refreshToken.create({
    data: {
      tokenHash: hash,
      userId: user.id,
      sessionVersion: user.sessionVersion,
      deviceName,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return {
    accessToken,
    refreshToken: raw,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}
