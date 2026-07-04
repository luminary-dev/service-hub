// Drift guard for the services' identical-copy convention (#29): services are
// deliberately self-contained (no shared package — each mirror builds alone),
// so shared modules exist as canonical copies that MUST stay in lockstep.
// This test fails the required root CI check the moment two copies diverge.
// If you meant to change one of these modules, change every copy.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

const svc = (name: string, file: string) =>
  path.join(ROOT, "services", name, "src", "lib", file);

// Groups whose members must be byte-identical. Provider's categories.ts is
// deliberately NOT in its group: provider owns the table and reads its own
// DB, while identity/job fetch S2S — same factory, different fetcher.
const IDENTICAL: Record<string, string[]> = {
  "field-rules.ts": [
    svc("identity-service", "field-rules.ts"),
    svc("provider-service", "field-rules.ts"),
  ],
  "constants.ts": [
    svc("identity-service", "constants.ts"),
    svc("provider-service", "constants.ts"),
    svc("job-service", "constants.ts"),
  ],
  "categories.ts (S2S variant)": [
    svc("identity-service", "categories.ts"),
    svc("job-service", "categories.ts"),
  ],
  "http.ts": [
    svc("identity-service", "http.ts"),
    svc("provider-service", "http.ts"),
    svc("review-service", "http.ts"),
    svc("job-service", "http.ts"),
    svc("notification-service", "http.ts"),
  ],
  "logging.ts": [
    svc("identity-service", "logging.ts"),
    svc("provider-service", "logging.ts"),
    svc("review-service", "logging.ts"),
    svc("job-service", "logging.ts"),
    svc("notification-service", "logging.ts"),
    svc("api-gateway", "logging.ts"),
  ],
  "orphans.ts": [
    svc("provider-service", "orphans.ts"),
    svc("review-service", "orphans.ts"),
  ],
};

// storage.ts differs only by the documented per-service SERVICE_FILE_PREFIX
// line — compare with that line dropped.
const NORMALIZED: Record<string, string[]> = {
  "storage.ts": [
    svc("provider-service", "storage.ts"),
    svc("review-service", "storage.ts"),
  ],
};

const read = (p: string) => readFileSync(p, "utf8");
const normalize = (s: string) =>
  s
    .split("\n")
    .filter((line) => !line.includes("SERVICE_FILE_PREFIX ="))
    .join("\n");

describe("shared-module copies stay in lockstep across services", () => {
  for (const [name, files] of Object.entries(IDENTICAL)) {
    it(`${name} is byte-identical in all ${files.length} services`, () => {
      const [first, ...rest] = files;
      const reference = read(first);
      for (const file of rest) {
        expect(read(file), `${file} drifted from ${first}`).toBe(reference);
      }
    });
  }

  for (const [name, files] of Object.entries(NORMALIZED)) {
    it(`${name} is identical apart from SERVICE_FILE_PREFIX`, () => {
      const [first, ...rest] = files;
      const reference = normalize(read(first));
      for (const file of rest) {
        expect(normalize(read(file)), `${file} drifted from ${first}`).toBe(
          reference
        );
      }
    });
  }
});
