import { cookies } from "next/headers";
import type { Locale } from "./i18n";

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get("lang")?.value;
  return value === "si" ? "si" : "en";
}
