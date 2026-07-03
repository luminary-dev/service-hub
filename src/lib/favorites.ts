import { db } from "./db";

// Set of provider IDs the user has saved, for marking cards/profiles.
export async function getFavoriteIds(userId: string): Promise<Set<string>> {
  const rows = await db.favorite.findMany({
    where: { userId },
    select: { providerId: true },
  });
  return new Set(rows.map((r) => r.providerId));
}

export async function isFavorited(userId: string, providerId: string) {
  const row = await db.favorite.findUnique({
    where: { userId_providerId: { userId, providerId } },
  });
  return !!row;
}
