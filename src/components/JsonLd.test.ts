import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "./JsonLd";

describe("serializeJsonLd", () => {
  it("produces valid JSON that round-trips", () => {
    const data = { "@type": "WebSite", name: "Baas.lk" };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });

  it("escapes '<' so a value cannot close the script element early", () => {
    // A malicious name containing "</script>" must not break out of the
    // <script type="application/ld+json"> block (JSON-LD injection).
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("\\u003c");
    // Still parses back to the original string once unescaped by the JSON reader.
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>");
  });
});
