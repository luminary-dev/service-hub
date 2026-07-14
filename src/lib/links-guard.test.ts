import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Regression guard for #364: every internal navigation on the localized
// (non-admin) surface must go through localizedHref(), otherwise a Sinhala
// user browsing under /si gets silently dropped back to English-root URLs.
// This scans the app + component sources for literal root-path navigations —
// href="/...", href={`/...`}, router.push("/..."), redirect("/...") — and
// fails with the offending file:line so the fix is obvious: wrap the path in
// localizedHref(path, locale).

const SRC = fileURLToPath(new URL("../", import.meta.url));

// The admin console is deliberately English-only (it is never linked from
// localized user flows), so admin surfaces and admin-destination pushes are
// exempt. Everything else must localize.
const EXEMPT_DIRS = ["app/admin", "components/admin"];
const EXEMPT_PATHS = [/^\/admin(\/|$|["'`?#])/];

// Literal internal navigations that bypass localizedHref. External URLs,
// tel:/mailto:, hashes and /api/* fetches never match these.
const PATTERNS: { re: RegExp; what: string }[] = [
  { re: /href="(\/[^"]*)"/g, what: "href" },
  { re: /href=\{`(\/[^`]*)`\}/g, what: "href" },
  {
    re: /router\.(?:push|replace)\(\s*["'`](\/[^"'`]*)["'`]/g,
    what: "router.push/replace",
  },
  {
    re: /(?<![\w.])(?:permanentR|r)edirect\(\s*["'`](\/[^"'`]*)["'`]/g,
    what: "redirect",
  },
];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name))
      yield full;
  }
}

describe("locale-prefix guard (#364)", () => {
  it("has no literal root-path href/redirect/push outside the admin console", () => {
    const violations: string[] = [];
    for (const scanRoot of ["app", "components"]) {
      for (const file of walk(join(SRC, scanRoot))) {
        const rel = relative(SRC, file).replaceAll("\\", "/");
        if (EXEMPT_DIRS.some((d) => rel.startsWith(`${d}/`))) continue;
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          for (const { re, what } of PATTERNS) {
            for (const m of line.matchAll(re)) {
              const path = m[1];
              if (path.startsWith("/api/")) continue;
              if (EXEMPT_PATHS.some((p) => p.test(path))) continue;
              violations.push(
                `src/${rel}:${i + 1} — literal ${what} "${path}" bypasses localizedHref()`,
              );
            }
          }
        });
      }
    }
    expect(violations).toEqual([]);
  });
});
