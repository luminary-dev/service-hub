import { cookies } from "next/headers";

export type Theme = "light" | "dark";

export const THEME_COOKIE = "theme";

/** Explicit user choice from the `theme` cookie; light is the default. */
export async function getTheme(): Promise<Theme> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return value === "dark" ? "dark" : "light";
}
