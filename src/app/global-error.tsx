"use client";

import { useEffect } from "react";

// Catches errors thrown by the ROOT layout itself (e.g. getLocale/getTheme),
// which the regular error.tsx — rendered inside that layout — cannot. It
// replaces the whole document, so it ships its own <html>/<body> and uses
// inline styles (the app stylesheet may not have loaded). Kept English-only and
// dependency-free so it renders even when i18n/theme setup is what failed.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#faf9f7",
          color: "#1a1a1a",
        }}
      >
        <div style={{ maxWidth: "28rem", padding: "2rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: "0.75rem", color: "#555", lineHeight: 1.6 }}>
            An unexpected error occurred while loading Baas.lk. Please try again.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              cursor: "pointer",
              border: "none",
              borderRadius: "9999px",
              background: "#8f3a1c",
              color: "#fff",
              fontSize: "0.875rem",
              fontWeight: 600,
              padding: "0.625rem 1.5rem",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
