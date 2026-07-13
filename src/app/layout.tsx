import type { Metadata, Viewport } from "next";
import {
  IBM_Plex_Sans,
  IBM_Plex_Mono,
  Noto_Sans_Sinhala,
} from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { I18nProvider } from "@/components/I18nProvider";
import { ToastProvider } from "@/components/ToastProvider";
import ChatAssistant from "@/components/ChatAssistant";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import { getSession } from "@/lib/auth";
import { getLocale, getUrlLocale } from "@/lib/locale";
import { siteOpenGraph } from "@/lib/seo";
import { getTheme } from "@/lib/theme";
import { dict } from "@/lib/i18n";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// Runs synchronously in <head>, before first paint (see the Next.js
// "preventing flash before hydration" guide). The theme is light by default
// and only dark when the `theme=dark` cookie is set — the server already
// renders the class from that cookie, so this just re-asserts it pre-paint as
// a belt-and-suspenders against a stale cached document.
const THEME_SCRIPT = `(function(){try{var d=document.documentElement,dark=/(?:^|; )theme=dark(?:;|$)/.test(document.cookie);if(d.classList.contains("dark")!==dark)d.classList.toggle("dark",dark)}catch(e){}})()`;

// Body / UI + headings: IBM Plex Sans, the engineering-drawing sans that
// anchors the blueprint/technical look.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// IBM Plex Mono for spec labels, part numbers, coordinates and ticks.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const notoSinhala = Noto_Sans_Sinhala({
  variable: "--font-sinhala",
  subsets: ["sinhala"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Browser UI theme-color (#263). Per the current Next API this lives on the
// `viewport` export, not `metadata`. Light/dark match the app's surface/page
// tokens (globals.css / docs/DESIGN.md) so the mobile address bar tracks the
// theme the same way the UI does.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#191a1f" },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const [locale, urlLocale] = await Promise.all([getLocale(), getUrlLocale()]);
  const m = dict[locale].meta;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: m.title, template: `%s · ${SITE_NAME}` },
    description: m.description,
    // The manifest, favicon/icon/apple-icon links, and the default OG/Twitter
    // image are wired via the file conventions in this directory
    // (manifest.ts, favicon.ico, icon.svg, apple-icon.tsx, opengraph-image.tsx)
    // — Next injects those <head> tags automatically. appleWebApp only exists
    // as metadata, so it's set explicitly here (#263).
    appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "default" },
    // No og:url here (#379): the layout doesn't know the page path, and a
    // site-wide url would mismatch every non-home canonical. Pages that emit
    // a canonical set their own matching og:url via siteOpenGraph(..., path).
    openGraph: siteOpenGraph(locale, urlLocale),
    twitter: { card: "summary_large_image", title: m.title, description: m.description },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [locale, theme, session] = await Promise.all([
    getLocale(),
    getTheme(),
    getSession(),
  ]);
  const t = dict[locale];
  const impersonating = Boolean(session?.impersonatedBy);

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${plexSans.variable} ${plexMono.variable} ${notoSinhala.variable} h-full antialiased${
        theme === "dark" ? " dark" : ""
      }`}
    >
      <head>
        {/* SSR-only, deterministic. suppressHydrationWarning because some
            browser extensions rewrite inline <script> tags (swap the content
            for an extension src) before React hydrates, which would otherwise
            log a spurious mismatch here. */}
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
      </head>
      <body
        className={`flex min-h-screen flex-col${impersonating ? " pt-10" : ""}`}
      >
        {/* Site-wide "view as" indicator (#234) — fixed, so it stays above
            the sticky navbar for the whole impersonation session. The pt-10
            above reserves its height so it never overlaps page content. */}
        {impersonating && session && (
          <ImpersonationBanner name={session.name} />
        )}
        {/* First focusable element on every page: lets keyboard and screen
            reader users jump past the navbar (WCAG 2.4.1 Bypass Blocks). */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-brand-700 focus:px-5 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white dark:focus:text-ink-50"
        >
          {t.a11y.skipToContent}
        </a>
        <I18nProvider locale={locale}>
          <ToastProvider>
            <Navbar />
            <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
              {children}
            </main>
            <Footer />
            <ChatAssistant />
          </ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
