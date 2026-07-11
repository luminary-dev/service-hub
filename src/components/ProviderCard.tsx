import Link from "next/link";
import Image from "next/image";
import { FaCircleCheck } from "@/components/icons";
import Stars from "./Stars";
import Avatar from "./Avatar";
import CategoryIcon from "./CategoryIcon";
import FavoriteButton from "./FavoriteButton";
import { isSvg } from "@/lib/image";
import { formatDate, formatLKR } from "@/lib/format";
import {
  dict,
  categoryLabelLoc,
  districtLabelLoc,
  priceTypeLabelLoc,
  type Locale,
} from "@/lib/i18n";
import { localizedHref } from "@/lib/links";

// Real trade photography (public/images/workers) keyed by category slug — a
// fallback cover when a provider hasn't uploaded their own. Each category has a
// POOL of variants so same-trade providers don't all share one image; the
// specific one is chosen deterministically per provider id (tradePhoto below).
// Categories without a pool keep the flat placeholder. Landscape (1536x1024) to
// match the card's banner crop.
const TRADE_PHOTOS: Record<string, string[]> = {
  mechanic: [1, 2, 3].map((n) => `/images/workers/mechanic-${n}.jpg`),
  electrician: [1, 2, 3].map((n) => `/images/workers/electrician-${n}.jpg`),
  plumber: [1, 2, 3].map((n) => `/images/workers/plumber-${n}.jpg`),
  carpenter: [1, 2, 3].map((n) => `/images/workers/carpenter-${n}.jpg`),
  mason: [1, 2, 3].map((n) => `/images/workers/mason-${n}.jpg`),
  painter: [1, 2, 3].map((n) => `/images/workers/painter-${n}.jpg`),
  welder: [1, 2, 3].map((n) => `/images/workers/welder-${n}.jpg`),
  "garden-designer": [1, 2, 3].map((n) => `/images/workers/garden-designer-${n}.jpg`),
  roofer: [1, 2, 3].map((n) => `/images/workers/roofer-${n}.jpg`),
};

// Stable per-provider pick from the category pool: the same provider always
// shows the same cover, but two carpenters get different ones.
function tradePhoto(category: string, seed: string): string | undefined {
  const pool = TRADE_PHOTOS[category];
  if (!pool || pool.length === 0) return undefined;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return pool[h % pool.length];
}

// Card payload as served by `GET /api/providers` on the gateway
// (provider-service's ProviderCardDTO). Dates arrive as ISO strings; rating
// and reviewCount come precomputed by review-service.
export type ProviderCardDTO = {
  id: string;
  userId: string;
  name: string;
  category: string;
  headline: string;
  district: string;
  city: string;
  experience: number;
  // `available` is the EFFECTIVE availability (the service already folds the
  // away window in); `awayUntil` is set when the provider is on leave (#49).
  available: boolean;
  awayUntil: string | null;
  verificationStatus: string;
  verifiedAt: string | null;
  createdAt: string;
  avatarUrl: string | null;
  coverPhoto: string | null;
  photos: { url: string; caption: string | null }[];
  services: { id: string; title: string; price: number; priceType: string }[];
  fromPrice: number | null;
  fromPriceType: string | null;
  rating: number | null;
  reviewCount: number;
};

export default function ProviderCard({
  p,
  locale = "en",
  showFavorite = false,
  favorited = false,
}: {
  p: ProviderCardDTO;
  locale?: Locale;
  showFavorite?: boolean;
  favorited?: boolean;
}) {
  const t = dict[locale];
  const verified = p.verificationStatus === "VERIFIED";
  // Away mode (#49): a future awayUntil replaces the "Available" chip with a
  // localized "Away until {date}" chip; a past one is inert.
  const away = p.awayUntil !== null && new Date(p.awayUntil) > new Date();
  // Prefer a real uploaded photo; otherwise fall back to trade photography,
  // then to the generated placeholder cover.
  const cover =
    p.coverPhoto && !isSvg(p.coverPhoto)
      ? p.coverPhoto
      : tradePhoto(p.category, p.id) ?? p.coverPhoto;
  return (
    <div className="relative">
      {showFavorite && (
        <div className="absolute right-3 top-3 z-20">
          <FavoriteButton providerId={p.id} initialFavorited={favorited} />
        </div>
      )}
      <Link
        href={localizedHref(`/providers/${p.id}`, locale)}
        className="card group block overflow-hidden transition-[border-color,transform,box-shadow] duration-200 ease-snap hover:-translate-y-1 hover:border-brand-400 hover:shadow-[0_16px_40px_rgba(34,29,24,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 active:scale-[0.99]"
      >
        {/* -- Cover: catalogue "plate" with scrim, frame & overprints -- */}
        <div className="relative h-40 overflow-hidden bg-ink-100">
          {cover ? (
            <Image
              src={cover}
              alt=""
              fill
              sizes="(min-width: 1024px) 384px, (min-width: 640px) 50vw, 100vw"
              unoptimized={isSvg(cover)}
              className="object-cover transition-transform duration-500 ease-snap group-hover:scale-[1.06]"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-[repeating-linear-gradient(45deg,var(--color-ink-100),var(--color-ink-100)_11px,var(--color-ink-200)_11px,var(--color-ink-200)_22px)]">
              <CategoryIcon slug={p.category} className="h-10 w-10 text-ink-400" />
            </div>
          )}
          {/* legibility scrim + printed frame */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-black/0 to-black/15" />
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/10" />

          {/* category tag, overprinted like a magazine kicker */}
          <span className="absolute left-3 top-3 rounded-sm bg-black/45 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-sm">
            {categoryLabelLoc(p.category, locale)}
          </span>

          {/* availability */}
          {away ? (
            <span className="chip absolute bottom-3 right-3 bg-white/95 text-amber-700 dark:bg-ink-50/90">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {t.card.awayUntil(formatDate(p.awayUntil!, locale))}
            </span>
          ) : (
            p.available && (
              <span className="chip absolute bottom-3 right-3 bg-white/95 text-emerald-700 dark:bg-ink-50/90">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {t.card.available}
              </span>
            )
          )}
        </div>

        {/* -- Body -- */}
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="relative z-10 -mt-10 rounded-full border-4 border-surface shadow-[0_4px_12px_rgba(34,29,24,0.12)]">
              <Avatar name={p.name} url={p.avatarUrl} size={56} />
            </div>
            <div className="min-w-0 flex-1 pt-1.5">
              <h3 className="flex items-center gap-1.5 truncate font-display text-base font-semibold text-ink-900 transition-colors duration-200 group-hover:text-brand-700">
                <span className="truncate">{p.name}</span>
                {verified && (
                  <FaCircleCheck
                    className="h-4 w-4 shrink-0 text-brand-600"
                    title={t.card.verified}
                  />
                )}
              </h3>
              <p className="mt-0.5 truncate font-mono text-[11px] uppercase tracking-wider text-ink-500">
                {p.city} · {districtLabelLoc(p.district, locale)}
                {p.experience > 0 && <> · {t.card.yrs(p.experience)}</>}
              </p>
            </div>
          </div>

          <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-600">
            {p.headline}
          </p>

          <div className="mt-4 flex items-center justify-between border-t border-dashed border-ink-300 pt-3.5">
            {p.rating !== null ? (
              <span className="flex items-center gap-1.5 text-sm">
                <Stars
                  rating={p.rating}
                  label={t.a11y.rated(p.rating.toFixed(1))}
                />
                <span className="font-semibold text-ink-800">
                  {p.rating.toFixed(1)}
                </span>
                <span className="text-ink-500">({p.reviewCount})</span>
              </span>
            ) : (
              <span className="text-sm text-ink-500">{t.card.noReviews}</span>
            )}
            {p.fromPrice !== null && (
              <span className="rounded-sm border border-brand-200 bg-brand-50 px-2.5 py-1 font-mono text-xs font-semibold tabular-nums text-brand-800">
                {formatLKR(p.fromPrice, locale)}
                {p.fromPriceType && (
                  <span className="font-normal text-brand-700/70">
                    {" "}
                    · {priceTypeLabelLoc(p.fromPriceType, locale)}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}
