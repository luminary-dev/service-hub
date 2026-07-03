// Port of the monolith's src/lib/provider-auth.ts: the current provider is the
// one owned by the authenticated user, and only PROVIDER-role sessions count.
import type { Context } from "hono";
import { db } from "../db";
import { getAuth } from "./http";

export async function getCurrentProvider(c: Context) {
  const auth = getAuth(c);
  if (!auth || auth.role !== "PROVIDER") return null;
  return db.provider.findUnique({ where: { userId: auth.userId } });
}
