import { cookies } from "next/headers";

export type Theme = "light" | "dark" | "system";

export const THEME_COOKIE = "theme";

/** Explicit user choice from the `theme` cookie; no cookie means "system". */
export async function getTheme(): Promise<Theme> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return value === "dark" || value === "light" ? value : "system";
}
