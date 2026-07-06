import type { Metadata } from "next";
import {
  Hanken_Grotesk,
  Space_Grotesk,
  Space_Mono,
  Fraunces,
  Noto_Sans_Sinhala,
} from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { I18nProvider } from "@/components/I18nProvider";
import { ToastProvider } from "@/components/ToastProvider";
import ChatAssistant from "@/components/ChatAssistant";
import { getLocale } from "@/lib/locale";
import { getTheme } from "@/lib/theme";
import { dict } from "@/lib/i18n";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// Runs synchronously in <head>, before first paint (see the Next.js
// "preventing flash before hydration" guide). Keeps <html class="dark"> in
// sync with the `theme` cookie, falling back to prefers-color-scheme when no
// cookie is set (the "system" state). The matchMedia listener follows live
// OS theme changes, and the MutationObserver re-asserts the class if a
// server-driven React update rewrites the html className (e.g. right after
// the toggle clears the cookie back to "system" and calls router.refresh()).
const THEME_SCRIPT = `(function(){try{var d=document.documentElement,m=window.matchMedia("(prefers-color-scheme: dark)");function a(){var c=document.cookie.match(/(?:^|; )theme=(dark|light)(?:;|$)/),v=c?c[1]==="dark":m.matches;if(d.classList.contains("dark")!==v)d.classList.toggle("dark",v)}a();m.addEventListener("change",a);new MutationObserver(a).observe(d,{attributes:true,attributeFilter:["class"]})}catch(e){}})()`;

// Body / UI text.
const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Display face for headings, logo and other high-impact type.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Monospace accents: eyebrow labels, stats and ticker.
const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

// High-contrast serif for editorial headlines and pull-quotes.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
  style: ["normal", "italic"],
  display: "swap",
});

const notoSinhala = Noto_Sans_Sinhala({
  variable: "--font-sinhala",
  subsets: ["sinhala"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const m = dict[locale].meta;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: m.title, template: `%s · ${SITE_NAME}` },
    description: m.description,
    openGraph: {
      title: m.title,
      description: m.description,
      siteName: SITE_NAME,
      type: "website",
      locale: locale === "si" ? "si_LK" : "en_US",
      url: SITE_URL,
    },
    twitter: { card: "summary_large_image", title: m.title, description: m.description },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [locale, theme] = await Promise.all([getLocale(), getTheme()]);
  const t = dict[locale];

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${hanken.variable} ${spaceGrotesk.variable} ${spaceMono.variable} ${fraunces.variable} ${notoSinhala.variable} h-full antialiased${
        theme === "dark" ? " dark" : ""
      }`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col">
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
