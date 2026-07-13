import { loginNextHref, localizedHref } from "./links";
import { getUrlLocale } from "./locale";

// Login URL for a signed-out gate on a session-only page (#560): carries the
// locale-prefixed path the visitor was after as ?next=, so a successful
// sign-in returns them there instead of the generic listing. The /login URL
// itself is also rendered in the visitor's URL space (#364), so a /si visitor
// signs in on /si/login rather than dropping to English. Server-only (reads
// the URL locale from request headers); pass the unprefixed app path.
export async function loginNext(path: string): Promise<string> {
  const locale = await getUrlLocale();
  return localizedHref(loginNextHref(localizedHref(path, locale)), locale);
}
