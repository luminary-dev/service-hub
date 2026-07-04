import Link from "next/link";
import { redirect } from "next/navigation";
import { FaInbox, FaRegHeart, FaRegStar } from "react-icons/fa6";
import { apiJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { categoryLabelLoc, dict } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import ProviderCard, { ProviderCardDTO } from "@/components/ProviderCard";
import Stars from "@/components/Stars";
import VerifiedBadge from "@/components/VerifiedBadge";

export const dynamic = "force-dynamic";

type AccountInquiry = {
  id: string;
  message: string;
  status: string;
  createdAt: string;
  respondedAt: string | null;
  unreadCount: number;
  provider: { id: string; name: string; category: string; suspended: boolean };
};

type AccountReview = {
  id: string;
  rating: number;
  comment: string;
  verified: boolean;
  createdAt: string;
  provider: { id: string; name: string };
  photos: { id: string; url: string }[];
};

// Same palette as the provider dashboard's inquiry list.
const STATUS_STYLES: Record<string, string> = {
  NEW: "bg-brand-50 text-brand-700 ring-brand-200",
  RESPONDED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  CLOSED: "bg-ink-100 text-ink-500 ring-ink-200",
};

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [locale, favorites, inquiriesData, reviewsData] = await Promise.all([
    getLocale(),
    apiJson<{ providerIds: string[] }>("/api/favorites"),
    apiJson<{ inquiries: AccountInquiry[] }>("/api/account/inquiries"),
    apiJson<{ reviews: AccountReview[] }>("/api/account/reviews"),
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

  const inquiries = inquiriesData?.inquiries ?? [];
  const reviews = reviewsData?.reviews ?? [];
  const statusLabel: Record<string, string> = {
    NEW: t.account.statusNew,
    RESPONDED: t.account.statusResponded,
    CLOSED: t.account.statusClosed,
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
            {t.account.title}
          </h1>
          <p className="mt-1 text-ink-600">{t.account.subtitle}</p>
        </div>
        <Link href="/account/security" className="btn-secondary shrink-0">
          {t.security.link}
        </Link>
      </div>

      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-ink-900">
          <FaRegHeart className="h-5 w-5 text-ink-400" />
          {t.account.savedTitle}
        </h2>
        {results.length === 0 ? (
          <div className="card mt-4 flex flex-col items-center px-6 py-16 text-center">
            <FaRegHeart className="h-12 w-12 text-ink-300" />
            <p className="mt-4 max-w-sm text-sm text-ink-500">
              {t.account.empty}
            </p>
            <Link href="/providers" className="btn-primary mt-6">
              {t.account.emptyCta}
            </Link>
          </div>
        ) : (
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
      </section>

      <div className="mt-12 grid items-start gap-10 lg:grid-cols-2">
        <section>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-ink-900">
            <FaInbox className="h-5 w-5 text-ink-400" />
            {t.account.inquiriesTitle}
          </h2>
          {inquiries.length === 0 ? (
            <div className="card mt-4 px-6 py-12 text-center">
              <p className="mx-auto max-w-sm text-sm text-ink-500">
                {t.account.inquiriesEmpty}
              </p>
            </div>
          ) : (
            <ul className="mt-4 space-y-4">
              {inquiries.map((i) => (
                <li key={i.id} className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      {i.provider.suspended ? (
                        <span className="font-semibold text-ink-900">
                          {i.provider.name}
                        </span>
                      ) : (
                        <Link
                          href={`/providers/${i.provider.id}`}
                          className="font-semibold text-ink-900 hover:text-brand-700"
                        >
                          {i.provider.name}
                        </Link>
                      )}
                      <p className="mt-0.5 text-sm text-ink-500">
                        {categoryLabelLoc(i.provider.category, locale)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`chip ring-1 ${STATUS_STYLES[i.status] ?? STATUS_STYLES.NEW}`}
                      >
                        {statusLabel[i.status] ?? i.status}
                      </span>
                      <span className="text-xs text-ink-500">
                        {formatDate(i.createdAt, locale)}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-2 whitespace-pre-line text-sm leading-relaxed text-ink-600">
                    {i.message}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <Link
                      href={`/account/inquiries/${i.id}`}
                      className="text-sm font-medium text-brand-600 hover:text-brand-700"
                    >
                      {t.messages.open}
                    </Link>
                    {i.unreadCount > 0 && (
                      <span className="chip bg-brand-600 text-white">
                        {t.messages.unread(i.unreadCount)}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-ink-900">
            <FaRegStar className="h-5 w-5 text-ink-400" />
            {t.account.reviewsTitle}
          </h2>
          {reviews.length === 0 ? (
            <div className="card mt-4 px-6 py-12 text-center">
              <p className="mx-auto max-w-sm text-sm text-ink-500">
                {t.account.reviewsEmpty}
              </p>
            </div>
          ) : (
            <ul className="mt-4 space-y-4">
              {reviews.map((r) => (
                <li key={r.id} className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link
                        href={`/providers/${r.provider.id}`}
                        className="font-semibold text-ink-900 hover:text-brand-700"
                      >
                        {r.provider.name}
                      </Link>
                      <div className="mt-1 flex items-center gap-2">
                        <Stars rating={r.rating} />
                        {r.verified && (
                          <VerifiedBadge label={t.account.verifiedReview} />
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-ink-500">
                      {formatDate(r.createdAt, locale)}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-600">
                    {r.comment}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
