import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  getRewrittenUrl,
  isRewrite,
  // The proxy.md docs call this unstable_doesProxyMatch, but 16.2.10 still
  // exports it under the pre-rename name.
  unstable_doesMiddlewareMatch,
} from "next/experimental/testing/server";
import { config, proxy } from "./proxy";

const ORIGINAL_GATEWAY_URL = process.env.GATEWAY_URL;

afterEach(() => {
  if (ORIGINAL_GATEWAY_URL === undefined) delete process.env.GATEWAY_URL;
  else process.env.GATEWAY_URL = ORIGINAL_GATEWAY_URL;
});

describe("proxy", () => {
  it("rewrites /api/* to GATEWAY_URL read at request time", () => {
    process.env.GATEWAY_URL = "http://api-gateway:4000";
    const response = proxy(
      new NextRequest("http://localhost:3000/api/providers/123"),
    );
    expect(isRewrite(response)).toBe(true);
    expect(getRewrittenUrl(response)).toBe(
      "http://api-gateway:4000/api/providers/123",
    );
  });

  it("picks up a changed GATEWAY_URL without a rebuild", () => {
    process.env.GATEWAY_URL = "http://gateway-a:4000";
    const first = proxy(new NextRequest("http://localhost:3000/api/jobs"));
    process.env.GATEWAY_URL = "http://gateway-b:4000";
    const second = proxy(new NextRequest("http://localhost:3000/api/jobs"));
    expect(getRewrittenUrl(first)).toBe("http://gateway-a:4000/api/jobs");
    expect(getRewrittenUrl(second)).toBe("http://gateway-b:4000/api/jobs");
  });

  it("preserves the query string", () => {
    process.env.GATEWAY_URL = "http://api-gateway:4000";
    const response = proxy(
      new NextRequest("http://localhost:3000/api/providers?district=colombo&page=2"),
    );
    expect(getRewrittenUrl(response)).toBe(
      "http://api-gateway:4000/api/providers?district=colombo&page=2",
    );
  });

  it("falls back to localhost:4000 when GATEWAY_URL is unset", () => {
    delete process.env.GATEWAY_URL;
    const response = proxy(new NextRequest("http://localhost:3000/api/auth/me"));
    expect(getRewrittenUrl(response)).toBe("http://localhost:4000/api/auth/me");
  });

  it("matches /api/*, /si, and page routes — but not Next internals/assets", () => {
    expect(
      unstable_doesMiddlewareMatch({ config, url: "/api/providers" }),
    ).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, url: "/si" })).toBe(true);
    expect(
      unstable_doesMiddlewareMatch({ config, url: "/si/providers" }),
    ).toBe(true);
    // Page routes now match too (#204): the proxy owns x-locale everywhere.
    expect(unstable_doesMiddlewareMatch({ config, url: "/" })).toBe(true);
    expect(
      unstable_doesMiddlewareMatch({ config, url: "/dashboard" }),
    ).toBe(true);
    expect(
      unstable_doesMiddlewareMatch({ config, url: "/sinhala-page" }),
    ).toBe(true);
    // Next internals and metadata assets stay excluded.
    expect(
      unstable_doesMiddlewareMatch({ config, url: "/_next/static/chunk.js" }),
    ).toBe(false);
    expect(
      unstable_doesMiddlewareMatch({ config, url: "/favicon.ico" }),
    ).toBe(false);
  });

  describe("x-locale trust boundary (#204)", () => {
    it("overwrites a spoofed x-locale to 'en' on an English-root route", () => {
      const response = proxy(
        new NextRequest("http://localhost:3000/providers", {
          headers: { "x-locale": "si" },
        }),
      );
      // Not a rewrite/redirect — the request passes through to the app, but the
      // forged header is neutralised before getUrlLocale() can read it.
      expect(isRewrite(response)).toBe(false);
      expect(response.headers.get("x-middleware-request-x-locale")).toBe("en");
    });

    it("pins x-locale to 'en' when the client sends none", () => {
      const response = proxy(new NextRequest("http://localhost:3000/providers"));
      expect(response.headers.get("x-middleware-request-x-locale")).toBe("en");
    });

    it("does not send page routes to the gateway", () => {
      process.env.GATEWAY_URL = "http://api-gateway:4000";
      const response = proxy(new NextRequest("http://localhost:3000/dashboard"));
      expect(isRewrite(response)).toBe(false);
    });
  });

  describe("/si locale prefix (#67)", () => {
    it("rewrites /si to the root with an x-locale: si request header", () => {
      const response = proxy(new NextRequest("http://localhost:3000/si"));
      expect(isRewrite(response)).toBe(true);
      expect(getRewrittenUrl(response)).toBe("http://localhost:3000/");
      expect(response.headers.get("x-middleware-request-x-locale")).toBe("si");
    });

    it("strips the /si prefix and keeps the rest of the path and query", () => {
      const response = proxy(
        new NextRequest(
          "http://localhost:3000/si/providers?category=plumber&page=2",
        ),
      );
      expect(getRewrittenUrl(response)).toBe(
        "http://localhost:3000/providers?category=plumber&page=2",
      );
      expect(response.headers.get("x-middleware-request-x-locale")).toBe("si");
    });

    it("overrides a spoofed incoming x-locale header", () => {
      const response = proxy(
        new NextRequest("http://localhost:3000/si/providers", {
          headers: { "x-locale": "en" },
        }),
      );
      expect(response.headers.get("x-middleware-request-x-locale")).toBe("si");
    });

    it("does not rewrite root metadata files under /si — they 404 (#379)", () => {
      for (const path of [
        "/si/sitemap.xml",
        "/si/robots.txt",
        "/si/manifest.webmanifest",
      ]) {
        const response = proxy(
          new NextRequest(`http://localhost:3000${path}`),
        );
        // No rewrite: /si/* has no app route of its own, so the request
        // falls through to not-found instead of serving a duplicate of the
        // English-root file.
        expect(isRewrite(response)).toBe(false);
        expect(response.headers.get("x-middleware-request-x-locale")).toBe(
          "si",
        );
      }
    });

    it("does not send /si pages to the gateway", () => {
      process.env.GATEWAY_URL = "http://api-gateway:4000";
      const response = proxy(
        new NextRequest("http://localhost:3000/si/providers/123"),
      );
      expect(getRewrittenUrl(response)).toBe(
        "http://localhost:3000/providers/123",
      );
    });
  });
});
