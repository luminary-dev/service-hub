"use client";

import { useEffect, useRef } from "react";

// Cloudflare Turnstile widget (#633). Renders the official challenge and hands
// its token back via `onToken`. DEGRADES GRACEFULLY: with no `siteKey` (the
// dev/local and unconfigured-deploy case) it renders nothing and the form
// submits exactly as before. The server-side check (identity-service) is the
// authoritative gate; this only produces the token.
//
// The Cloudflare script is loaded once (explicit-render mode) and the widget is
// torn down on unmount. `resetNonce` lets the parent request a fresh token
// after a failed submit consumed the previous single-use one.

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileRenderOptions = {
  sitekey: string;
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
  "timeout-callback"?: () => void;
  theme?: "auto" | "light" | "dark";
  language?: string;
};

type TurnstileApi = {
  render: (el: HTMLElement, opts: TurnstileRenderOptions) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// Load the Cloudflare script once; resolve when window.turnstile is ready.
function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(
      SCRIPT_ID
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("turnstile")));
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("turnstile")));
    document.head.appendChild(script);
  });
}

export default function TurnstileWidget({
  siteKey,
  onToken,
  language,
  resetNonce = 0,
  id,
  className,
}: {
  /** Public site key. Unset → the widget renders nothing (graceful default). */
  siteKey?: string;
  /** Called with the token on success, or "" when it expires / errors / resets. */
  onToken: (token: string) => void;
  /** Widget UI language (e.g. "en" / "si"); Turnstile falls back if unsupported. */
  language?: string;
  /** Bump to force a fresh token after a consumed/expired one (e.g. failed submit). */
  resetNonce?: number;
  id?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (
          cancelled ||
          !window.turnstile ||
          !containerRef.current ||
          widgetIdRef.current
        ) {
          return;
        }
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "auto",
          language,
          callback: (token: string) => onToken(token),
          "expired-callback": () => onToken(""),
          "error-callback": () => onToken(""),
          "timeout-callback": () => onToken(""),
        });
      })
      .catch(() => {
        // Script blocked / offline — leave the token empty; the server still
        // gates registration, so this fails closed on the backend.
      });
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, language, onToken]);

  useEffect(() => {
    if (resetNonce > 0 && widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      onToken("");
    }
  }, [resetNonce, onToken]);

  if (!siteKey) return null;
  return <div ref={containerRef} id={id} className={className} />;
}
