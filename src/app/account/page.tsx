import Link from "next/link";
import { redirect } from "next/navigation";
import { FaRegHeart } from "react-icons/fa6";
import { apiJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import ProviderCard, { ProviderCardDTO } from "@/components/ProviderCard";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [locale, favorites] = await Promise.all([
    getLocale(),
    apiJson<{ providerIds: string[] }>("/api/favorites"),
  ]);
  const t = dict[locale];

  // Saved ids come newest-first from identity-service; the card lookup
  // excludes suspended profiles, and we keep the favorites order.
  const ids = favorites?.providerIds ?? [];
  let results: ProviderCardDTO[] = [];
  if (ids.length > 0) {
    const listing = await apiJson<{ providers: ProviderCardDTO[] }>(
      `/api/providers?ids=${ids.map(encodeURIComponent).join(",")}`
    );
    const order = new Map(ids.map((id, i) => [id, i]));
    results = (listing?.providers ?? [])
      .slice()
      .sort(
        (a, b) =>
          (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
        {t.account.title}
      </h1>
      <p className="mt-1 text-ink-600">{t.account.subtitle}</p>

      {results.length === 0 ? (
        <div className="card mt-8 flex flex-col items-center px-6 py-20 text-center">
          <FaRegHeart className="h-12 w-12 text-ink-300" />
          <p className="mt-4 max-w-sm text-sm text-ink-500">
            {t.account.empty}
          </p>
          <Link href="/providers" className="btn-primary mt-6">
            {t.account.emptyCta}
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((p) => (
            <ProviderCard
              key={p.id}
              p={p}
              locale={locale}
              showFavorite
              favorited
            />
          ))}
        </div>
      )}
    </div>
  );
}
