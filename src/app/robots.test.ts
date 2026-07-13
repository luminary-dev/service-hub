import { describe, expect, it } from "vitest";
import robots from "./robots";
import { SITE_URL } from "@/lib/site";

describe("robots", () => {
  const output = robots();
  const rules = Array.isArray(output.rules) ? output.rules[0] : output.rules;

  it("disallows the private areas in both URL locales (#379)", () => {
    for (const path of ["/dashboard", "/admin", "/account"]) {
      expect(rules.disallow).toContain(path);
      expect(rules.disallow).toContain(`/si${path}`);
    }
    expect(rules.disallow).toContain("/api/");
  });

  it("keeps the site crawlable and points at the sitemap", () => {
    expect(rules.userAgent).toBe("*");
    expect(rules.allow).toBe("/");
    expect(output.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
    expect(output.host).toBe(SITE_URL);
  });
});
