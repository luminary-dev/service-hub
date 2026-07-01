import { db } from "./db";
import { getSession } from "./auth";

export async function getCurrentProvider() {
  const session = await getSession();
  if (!session || session.role !== "PROVIDER") return null;
  return db.provider.findUnique({ where: { userId: session.userId } });
}
