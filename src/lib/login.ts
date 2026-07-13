import { loginNextHref, localizedHref } from "./links";
import { getUrlLocale } from "./locale";

// Login URL for a signed-out gate on a session-only page (#560): carries the
// locale-prefixed path the visitor was after as ?next=, so a successful
// sign-in returns them there instead of the generic listing. Server-only
// (reads the URL locale from request headers); pass the unprefixed app path.
export async function loginNext(path: string): Promise<string> {
  return loginNextHref(localizedHref(path, await getUrlLocale()));
}
