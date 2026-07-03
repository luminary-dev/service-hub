import type { Metadata } from "next";
import { Poppins, Noto_Sans_Sinhala } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { I18nProvider } from "@/components/I18nProvider";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const poppins = Poppins({
  variable: "--font-poppins",
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
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${poppins.variable} ${notoSinhala.variable} h-full antialiased`}
    >
      <body className="flex min-h-screen flex-col">
        <I18nProvider locale={locale}>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </I18nProvider>
      </body>
    </html>
  );
}
