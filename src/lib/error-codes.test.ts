import { describe, expect, it } from "vitest";
import { errorCodeOf, errorMessage } from "./error-codes";
import { dict } from "./i18n";

const codes = dict.en.errorCodes;

describe("errorCodeOf", () => {
  it("reads errorCode, then code", () => {
    expect(errorCodeOf({ errorCode: "invalid_credentials" })).toBe(
      "invalid_credentials"
    );
    expect(errorCodeOf({ code: "forbidden" })).toBe("forbidden");
  });

  it("ignores non-string / empty / missing codes and non-objects", () => {
    expect(errorCodeOf({ error: "boom" })).toBeUndefined();
    expect(errorCodeOf({ errorCode: "" })).toBeUndefined();
    expect(errorCodeOf({ errorCode: 42 })).toBeUndefined();
    expect(errorCodeOf(null)).toBeUndefined();
    expect(errorCodeOf("nope")).toBeUndefined();
  });
});

describe("errorMessage", () => {
  it("maps a known code to its localized string", () => {
    expect(errorMessage({ errorCode: "invalid_credentials" }, "fallback", codes)).toBe(
      codes.invalid_credentials
    );
    // Sinhala map resolves the same code to its Sinhala copy.
    expect(
      errorMessage({ errorCode: "invalid_credentials" }, "fallback", dict.si.errorCodes)
    ).toBe(dict.si.errorCodes.invalid_credentials);
  });

  it("falls back to the caller's localized generic for unknown/missing codes", () => {
    expect(errorMessage({ errorCode: "totally_unknown" }, "fallback", codes)).toBe(
      "fallback"
    );
    expect(errorMessage({}, "fallback", codes)).toBe("fallback");
  });

  it("never returns the raw backend message (#761)", () => {
    const data = { error: "English-only backend sentence" };
    expect(errorMessage(data, "localized fallback", codes)).toBe(
      "localized fallback"
    );
  });
});
