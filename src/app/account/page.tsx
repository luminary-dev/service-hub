import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { FaBell, FaIdCard, FaInbox, FaMagnifyingGlass, FaRegHeart, FaRegStar, type IconType } from "@/components/icons";
import { apiJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { loginNext } from "@/lib/login";
import { categoryLabelLoc, dict } from "@/lib/i18n";
import { localizedHref } from "@/lib/links";
import { formatDate } from "@/lib/format";
import ProviderCard, { ProviderCardDTO } from "@/components/ProviderCard";
import Stars from "@/components/Stars";
import VerifiedBadge from "@/components/VerifiedBadge";
import InView from "@/components/InView";
import PageHeader from "@/components/ui/PageHeader";
import StatReadout from "@/components/ui/StatReadout";
import EmptyState from "@/components/ui/EmptyState";
import AccountDetails from "@/components/AccountDetails";
import CloseProviderProfile from "@/components/CloseProviderProfile";
import SavedSearches, { SavedSearchItem } from "@/components/SavedSearches";
import NotificationPreferences from "@/components/NotificationPreferences";
import type { NotificationPreferenceDTO } from "@/lib/notifications";

// Caching (#57): session-gated and must reflect the user's own writes
// immediately — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

type AccountInquiry = {
  id: string;
  message: string;
  status: string;
  createdAt: string;
  respondedAt: string | null;
  unreadCount: number;
  // Null once the provider is erased (#650): the inquiry survives detached, so
  // the row renders a "Deleted provider" label with no profile link.
  provider: { id: string; name: string; category: string; suspended: boolean } | null;
};

type SavedSearchDTO = {
  id: string;
  name: string;
  query: string | null;
  category: string | null;
  district: string | null;
  createdAt: string;
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

// Mono spec label + iconed heading shared by the portal's three sections —
// the blueprint "REF / label" kicker over an h2, mirroring the section markers
// on the home and providers surfaces.
function SectionHeading({
  code,
  icon: Icon,
  title,
}: {
  code: string;
  icon: IconType;
  title: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
        <span className="rounded-sm bg-brand-700 px-1.5 py-0.5 text-white dark:text-ink-50">
          {code}
        </span>
        <span className="hidden h-px flex-1 bg-ink-300 sm:block" />
      </div>
      <h2 className="mt-3 flex items-center gap-2 text-2xl font-bold tracking-tight text-ink-900">
        <Icon className="h-5 w-5 text-ink-400" />
        {title}
      </h2>
    </div>
  );
}

export default async function AccountPage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) redirect(await loginNext("/account"));

  const [favorites, savedSearchData, notifPrefData, inquiriesData, reviewsData, meData] =
    await Promise.all([
      apiJson<{ providerIds: string[] }>("/api/favorites"),
      // Saved searches (#516) are customer-only; other roles get a 403.
      session.role === "CUSTOMER"
        ? apiJson<{ savedSearches: SavedSearchDTO[] }>("/api/saved-searches")
        : null,
      // Notification preferences (#394) — the full catalog × channel matrix.
      apiJson<{ preferences: NotificationPreferenceDTO[] }>(
        "/api/notification-preferences"
      ),
      apiJson<{ inquiries: AccountInquiry[] }>("/api/account/inquiries"),
      apiJson<{ reviews: AccountReview[] }>("/api/account/reviews"),
      apiJson<{
        user: {
          name: string;
          email: string;
          phone: string | null;
          emailVerified: string | null;
          avatarUrl: string | null;
          hasPassword: boolean;
        } | null;
      }>("/api/auth/me"),
    ]);
  const t = dict[locale];
  const me = meData?.user ?? null;

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

  // Saved searches (#516): pre-localize the re-run URL and a filter summary so
  // the client list stays dumb.
  const savedSearchItems: SavedSearchItem[] = (
    savedSearchData?.savedSearches ?? []
  ).map((s) => {
    const sp = new URLSearchParams();
    if (s.query) sp.set("q", s.query);
    if (s.category) sp.set("category", s.category);
    if (s.district) sp.set("district", s.district);
    return {
      id: s.id,
      name: s.name,
      href: localizedHref(`/providers?${sp.toString()}`, locale),
      filters: [
        s.query ? `“${s.query}”` : "",
        s.category ? categoryLabelLoc(s.category, locale) : "",
        s.district ?? "",
      ]
        .filter(Boolean)
        .join(" · "),
    };
  });

  const inquiries = inquiriesData?.inquiries ?? [];
  const reviews = reviewsData?.reviews ?? [];
  const statusLabel: Record<string, string> = {
    NEW: t.account.statusNew,
    RESPONDED: t.account.statusResponded,
    CLOSED: t.account.statusClosed,
  };

  return (
    <div>
      <PageHeader
        tag="ACCT"
        eyebrow={t.account.title}
        title={t.account.title}
        status={t.account.subtitle}
      >
        <div className="flex flex-col items-start gap-4 sm:items-end">
          <StatReadout
            stats={[
              { label: t.account.stats.saved, value: results.length },
              { label: t.account.stats.sent, value: inquiries.length },
              { label: t.account.stats.reviews, value: reviews.length },
            ]}
          />
          <Link
            href={localizedHref("/account/security", locale)}
            className="btn-secondary"
          >
            {t.security.link}
          </Link>
        </div>
      </PageHeader>

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {me && (
          <section className="mb-14">
            <SectionHeading
              code="ACC"
              icon={FaIdCard}
              title={t.account.detailsTitle}
            />
            <div className="mt-6">
              <AccountDetails
                initial={{
                  name: me.name,
                  phone: me.phone,
                  email: me.email,
                  emailVerified: me.emailVerified != null,
                  avatarUrl: me.avatarUrl,
                  hasPassword: me.hasPassword,
                }}
              />
            </div>

            {/* Become a provider (#401) — the conversion backend
                (POST /api/auth/complete-provider) already exists; this routes
                a CUSTOMER into the authed provider wizard at /welcome/provider. */}
            {session.role === "CUSTOMER" && (
              <div className="tech-corners mt-6 flex flex-col gap-4 rounded-lg border border-ink-300 bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold text-ink-900">
                    {t.account.becomeProviderTitle}
                  </h3>
                  <p className="mt-1 max-w-prose text-sm text-ink-600">
                    {t.account.becomeProviderBody}
                  </p>
                </div>
                <Link
                  href={localizedHref("/welcome/provider", locale)}
                  className="btn-primary shrink-0"
                >
                  {t.account.becomeProviderCta}
                </Link>
              </div>
            )}

            {/* Close provider profile (#403) — suspend/hide + revert to
                customer, session re-issued with no re-login. */}
            {session.role === "PROVIDER" && (
              <div className="mt-6">
                <CloseProviderProfile />
              </div>
            )}
          </section>
        )}

        {/* scroll-mt clears the sticky header when linked from the nav's
            "Saved" entry (/account#saved). */}
        <section id="saved" className="scroll-mt-24">
          <SectionHeading code="SAV" icon={FaRegHeart} title={t.account.savedTitle} />
          {results.length === 0 ? (
            <EmptyState
              className="mt-6"
              icon={FaRegHeart}
              title={t.account.empty}
              action={
                <Link
                  href={localizedHref("/providers", locale)}
                  className="btn-primary"
                >
                  {t.account.emptyCta}
                </Link>
              }
            />
          ) : (
            <InView
              stagger
              className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
            >
              {results.map((p) => (
                <ProviderCard
                  key={p.id}
                  p={p}
                  locale={locale}
                  showFavorite
                  favorited
                />
              ))}
            </InView>
          )}
        </section>

        {/* Saved searches (#516) — customer-only, mirroring the backend gate. */}
        {session.role === "CUSTOMER" && (
          <section className="mt-14">
            <SectionHeading
              code="SRCH"
              icon={FaMagnifyingGlass}
              title={t.account.searchesTitle}
            />
            <SavedSearches initial={savedSearchItems} />
          </section>
        )}

        {/* Notification preferences (#394) — per-type email / in-app toggles
            for the catalog events; auth/security emails are never listed. */}
        <section className="mt-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <SectionHeading
              code="NTF"
              icon={FaBell}
              title={t.notifications.prefsTitle}
            />
            <Link
              href={localizedHref("/account/notifications", locale)}
              className="text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              {t.notifications.viewAll}
            </Link>
          </div>
          <NotificationPreferences
            initial={notifPrefData?.preferences ?? null}
          />
        </section>

        <div className="mt-14 grid items-start gap-10 lg:grid-cols-2">
          <section>
            <SectionHeading
              code="INQ"
              icon={FaInbox}
              title={t.account.inquiriesTitle}
            />
            {inquiries.length === 0 ? (
              <EmptyState
                className="mt-6"
                icon={FaInbox}
                title={t.account.inquiriesEmpty}
              />
            ) : (
              <ul className="mt-6 space-y-4">
                {inquiries.map((i) => (
                  <li key={i.id} className="tech-corners card p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        {i.provider === null ? (
                          <span className="font-semibold text-ink-500">
                            {t.messages.deletedProvider}
                          </span>
                        ) : i.provider.suspended ? (
                          <span className="font-semibold text-ink-900">
                            {i.provider.name}
                          </span>
                        ) : (
                          <Link
                            href={localizedHref(
                              `/providers/${i.provider.id}`,
                              locale
                            )}
                            className="font-semibold text-ink-900 hover:text-brand-700"
                          >
                            {i.provider.name}
                          </Link>
                        )}
                        {i.provider !== null && (
                          <p className="mt-0.5 text-sm text-ink-500">
                            {categoryLabelLoc(i.provider.category, locale)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`chip ring-1 ${STATUS_STYLES[i.status] ?? STATUS_STYLES.NEW}`}
                        >
                          {statusLabel[i.status] ?? i.status}
                        </span>
                        <span className="font-mono text-xs tabular-nums text-ink-500">
                          {formatDate(i.createdAt, locale)}
                        </span>
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-2 whitespace-pre-line text-sm leading-relaxed text-ink-600">
                      {i.message}
                    </p>
                    <div className="mt-4 flex items-center gap-2 border-t border-dashed border-ink-200 pt-3">
                      <Link
                        href={localizedHref(`/account/inquiries/${i.id}`, locale)}
                        className="text-sm font-medium text-brand-600 hover:text-brand-700"
                      >
                        {t.messages.open}
                      </Link>
                      {i.unreadCount > 0 && (
                        <span className="chip bg-brand-600 text-white dark:text-ink-50">
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
            <SectionHeading
              code="REV"
              icon={FaRegStar}
              title={t.account.reviewsTitle}
            />
            {reviews.length === 0 ? (
              <EmptyState
                className="mt-6"
                icon={FaRegStar}
                title={t.account.reviewsEmpty}
              />
            ) : (
              <ul className="mt-6 space-y-4">
                {reviews.map((r) => (
                  <li key={r.id} className="tech-corners card p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Link
                          href={localizedHref(
                            `/providers/${r.provider.id}`,
                            locale
                          )}
                          className="font-semibold text-ink-900 hover:text-brand-700"
                        >
                          {r.provider.name}
                        </Link>
                        <div className="mt-1 flex items-center gap-2">
                          <Stars
                            rating={r.rating}
                            label={t.a11y.rated(r.rating.toFixed(1))}
                          />
                          {r.verified && (
                            <VerifiedBadge label={t.account.verifiedReview} />
                          )}
                        </div>
                      </div>
                      <span className="font-mono text-xs tabular-nums text-ink-500">
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
    </div>
  );
}
