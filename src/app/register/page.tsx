import Link from "next/link";
import { FaHouse, FaScrewdriverWrench } from "react-icons/fa6";
import { dict } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export const metadata = { title: "Join Baas.lk" };

export default async function RegisterChoicePage() {
  const locale = await getLocale();
  const t = dict[locale];

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-center text-3xl font-semibold tracking-tight text-ink-900">
        {t.choose.title}
      </h1>
      <p className="mt-2 text-center text-ink-600">{t.choose.sub}</p>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <Link
          href="/register/provider"
          className="group rounded-2xl bg-brand-700 p-8 transition-[background-color,transform] duration-200 ease-snap hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 active:scale-[0.99]"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-white">
            <FaScrewdriverWrench className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-xl font-semibold text-white">
            {t.choose.offerTitle}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-brand-100">
            {t.choose.offerBody}
          </p>
          <span className="mt-4 inline-block text-sm font-semibold text-white">
            {t.choose.offerCta}
          </span>
        </Link>

        <Link
          href="/register/customer"
          className="card group p-8 transition-[border-color,transform] duration-200 ease-snap hover:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 active:scale-[0.99]"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
            <FaHouse className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-xl font-semibold text-ink-900 transition-colors duration-200 group-hover:text-brand-700">
            {t.choose.needTitle}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            {t.choose.needBody}
          </p>
          <span className="mt-4 inline-block text-sm font-semibold text-brand-700">
            {t.choose.needCta}
          </span>
        </Link>
      </div>

      <p className="mt-8 text-center text-sm text-ink-500">
        {t.choose.already}{" "}
        <Link
          href="/login"
          className="font-semibold text-brand-600 hover:text-brand-700"
        >
          {t.choose.signIn}
        </Link>
      </p>
    </div>
  );
}
