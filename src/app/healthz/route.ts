// Liveness probe for the prod compose healthcheck → deploy health-gate (#385).
// Lives outside /api because src/proxy.ts rewrites /api/* to the gateway — a
// probe there would measure the gateway, not this server. Deliberately calls
// nothing upstream: it answers "is the Next server accepting requests", so a
// gateway blip can't cascade into Docker restart-looping the web container.
export function GET() {
  return new Response("ok", {
    headers: { "cache-control": "no-store" },
  });
}
