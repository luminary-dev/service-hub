import { describe, expect, it } from "vitest";
import { legal } from "./legal";

// Same drift guard as i18n.test.ts, for the legal copy that lives outside the
// dict: the Sinhala documents must mirror the English structure exactly —
// same sections, same paragraph counts — so nothing ships half-translated.
function shape(doc: (typeof legal)["en"]["terms"]): string[] {
  return [
    "title",
    "metaDescription",
    "updated",
    "intro",
    ...doc.sections.flatMap((s, i) => [
      `sections[${i}].heading`,
      ...s.body.map((_, j) => `sections[${i}].body[${j}]`),
    ]),
  ];
}

describe("legal copy parity", () => {
  it("terms: si mirrors the en structure", () => {
    expect(shape(legal.si.terms)).toEqual(shape(legal.en.terms));
  });

  it("privacy: si mirrors the en structure", () => {
    expect(shape(legal.si.privacy)).toEqual(shape(legal.en.privacy));
  });

  it("no empty strings anywhere", () => {
    for (const locale of ["en", "si"] as const) {
      for (const doc of [legal[locale].terms, legal[locale].privacy]) {
        expect(doc.title).not.toBe("");
        expect(doc.intro).not.toBe("");
        for (const s of doc.sections) {
          expect(s.heading).not.toBe("");
          for (const p of s.body) expect(p).not.toBe("");
        }
      }
    }
  });

  it("both documents carry the same last-updated date per locale", () => {
    expect(legal.en.terms.updated).toBe(legal.en.privacy.updated);
    expect(legal.si.terms.updated).toBe(legal.si.privacy.updated);
  });
});
