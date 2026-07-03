import { getSession } from "./auth";

export async function isAdmin() {
  const session = await getSession();
  return session?.role === "ADMIN";
}

export async function requireAdmin() {
  const session = await getSession();
  return session?.role === "ADMIN" ? session : null;
}
