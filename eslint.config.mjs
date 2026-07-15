import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import i18next from "eslint-plugin-i18next";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Backend services and templates are separate packages with their own
    // linting; the root config covers the web app only.
    "services/**",
    "docs/**",
    // Local tooling state (agent worktrees, settings) — never lint targets.
    ".claude/**",
    "backups/**",
    // k6 load scripts (#671) run in the k6 runtime (its own globals/imports),
    // not Node/Next — linting them with the web config only yields noise. They
    // are on-demand, never shipped in the web bundle.
    "load/**",
  ]),
  // Guard against hardcoded, untranslated user-facing strings (#672) so the
  // #566-class regressions don't creep back as Tamil (locale #2) lands. Scoped
  // to the UI layer, where visible JSX copy lives; every such string must route
  // through the i18n dictionary (`dict[locale]`, see src/lib/i18n.ts) so all
  // locales stay in sync. The plugin default `mode: "jsx-text-only"` flags only
  // plain text between JSX tags — not className/prop/other literals — so it
  // catches visible copy without drowning us in false positives. Attribute-level
  // copy (alt/placeholder/aria-label) is out of scope for now to avoid noise
  // from custom-component props; a follow-up can ratchet to `jsx-only`.
  {
    files: ["src/app/**/*.tsx", "src/components/**/*.tsx"],
    ignores: [
      // Tests aren't shipped UI; their fixtures are English strings by design.
      "**/*.test.tsx",
      "**/*.test.ts",
      // The top-level crash boundary renders before/without the i18n providers
      // (it replaces the root layout), so it can't resolve a locale — English
      // is the correct last-resort copy.
      "src/app/global-error.tsx",
      // OG images are generated (satori/ImageResponse) social cards, not DOM
      // UI; their branding text is canonical English, one card per share.
      "src/app/**/opengraph-image.tsx",
    ],
    plugins: { i18next },
    rules: {
      "i18next/no-literal-string": [
        "error",
        {
          // NB: options shallow-merge over the plugin defaults, so overriding
          // `words` means re-listing the built-in skips (punctuation, all-caps,
          // emoji, symbol-only) or we'd start flagging "©", "·", etc.
          words: {
            exclude: [
              // Plugin defaults:
              "[0-9!-/:-@[-`{-~]+", // ASCII digits/punctuation
              "[A-Z_-]+", // all-caps tokens
              /^\p{Emoji}+$/u, // emoji
              // Symbol/punctuation-only text (©, ·, arrows …). Replaces the
              // default HTML-entity list with a broader Unicode check so
              // decorative glyphs never trip the rule.
              /^[\p{P}\p{S}\s]+$/u,
              // Decorative "technical dossier" spec codes — ornamental,
              // locale-independent labels made of caps, digits and separators,
              // e.g. "AUTH-01", "REG-P / PRO", "REF / BAAS.LK · LK".
              /^[A-Z0-9][A-Z0-9./·\s-]*$/,
              // Brand / proper nouns rendered verbatim in every locale.
              "Baas",
              "\\.lk",
              "Baas\\.lk",
              "WhatsApp",
              "OpenStreetMap",
              // Decorative figure label in the hero blueprint caption.
              "Fig\\.",
            ],
          },
        },
      ],
    },
  },
]);

export default eslintConfig;
