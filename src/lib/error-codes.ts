// Backend error CODE → localized copy (#761).
//
// Services return English-only error strings (`data.error`). Rendering those
// verbatim leaks English sentences into the otherwise fully-Sinhala UI exactly
// when users most need clarity (failed login, rejected registration, blocked
// inquiry). Instead, services expose a stable machine-readable `errorCode`
// alongside the message; the client maps that code to a translated string from
// the `errorCodes` dict.
//
// This must work even before backend codes land: when the payload carries no
// code, or an unknown one, callers fall back to their OWN localized generic
// string (e.g. `t.login.failed`) — never to the raw `data.error`.

// Pull a stable code out of a gateway JSON body. Accepts either `errorCode`
// (preferred) or `code`, ignoring anything that isn't a non-empty string.
export function errorCodeOf(data: unknown): string | undefined {
  if (data && typeof data === "object") {
    const rec = data as Record<string, unknown>;
    const code = rec.errorCode ?? rec.code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return undefined;
}

// Localize a backend error. `codes` is the current locale's `dict[locale]
// .errorCodes` map (pass `t.errorCodes`). Returns the mapped translation for a
// known code, otherwise the caller's localized `fallback`. Never returns the
// raw backend message.
export function errorMessage(
  data: unknown,
  fallback: string,
  codes: Record<string, string>
): string {
  const code = errorCodeOf(data);
  if (code && codes[code]) return codes[code];
  return fallback;
}
