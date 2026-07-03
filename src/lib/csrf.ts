export const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Decides whether a request may perform a state change. Safe methods always
// pass. For unsafe methods we trust the browser-set Sec-Fetch-Site header
// (which a cross-site attacker page cannot forge); when it's absent (non-browser
// clients, which carry no ambient cookies to abuse) we fall back to comparing
// the Origin host with the request host.
export function isSameOriginRequest(req: {
  method: string;
  secFetchSite: string | null;
  origin: string | null;
  host: string | null;
}): boolean {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return true;

  if (req.secFetchSite) {
    return req.secFetchSite === "same-origin" || req.secFetchSite === "none";
  }

  // No Sec-Fetch-Site: not a browser cross-site request. Verify Origin if present.
  if (!req.origin) return true;
  try {
    return new URL(req.origin).host === req.host;
  } catch {
    return false;
  }
}
