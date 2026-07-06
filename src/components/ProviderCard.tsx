import Link from "next/link";
import Image from "next/image";
import { FaCircleCheck } from "react-icons/fa6";
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
  return (
    <div className="relative">
      {showFavorite && (
        <div className="absolute right-3 top-3 z-10">
          <FavoriteButton providerId={p.id} initialFavorited={favorited} />
        </div>
      )}
      <Link
        href={localizedHref(`/providers/${p.id}`, locale)}
        className="card group block overflow-hidden transition-[border-color,transform,box-shadow] duration-200 ease-snap hover:-translate-y-1 hover:border-brand-400 hover:shadow-[0_14px_34px_rgba(34,29,24,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 active:scale-[0.99]"
      >
        <div className="relative h-36 bg-ink-100">
        {p.coverPhoto ? (
          <Image
            src={p.coverPhoto}
            alt=""
            fill
            sizes="(min-width: 1024px) 384px, (min-width: 640px) 50vw, 100vw"
            unoptimized={isSvg(p.coverPhoto)}
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <CategoryIcon
              slug={p.category}
              className="h-10 w-10 text-ink-300"
            />
          </div>
        )}
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
        {p.experience > 0 && (
          <span className="chip absolute left-3 top-3 bg-black/70 text-white">
            {t.card.yrs(p.experience)}
          </span>
        )}
        </div>

      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="-mt-9 rounded-full border-4 border-surface">
            <Avatar name={p.name} url={p.avatarUrl} size={56} />
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <h3 className="truncate font-display font-semibold text-ink-900 transition-colors duration-200 group-hover:text-brand-700">
              {p.name}
            </h3>
            <p className="text-xs text-ink-500">
              {categoryLabelLoc(p.category, locale)} · {p.city},{" "}
              {districtLabelLoc(p.district, locale)}
            </p>
          </div>
        </div>

        {verified && (
          <span className="mt-3 inline-flex items-center gap-1.5 self-start rounded-full bg-brand-50 px-2.5 py-1 text-[11.5px] font-semibold text-brand-800">
            <FaCircleCheck className="h-3.5 w-3.5 shrink-0 text-brand-700" />
            {t.card.verified}
          </span>
        )}

        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-600">
          {p.headline}
        </p>

        <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3">
          {p.rating !== null ? (
            <span className="flex items-center gap-1.5 text-sm">
              <Stars rating={p.rating} label={t.a11y.rated(p.rating.toFixed(1))} />
              <span className="font-medium text-ink-700">
                {p.rating.toFixed(1)}
              </span>
              <span className="text-ink-500">({p.reviewCount})</span>
            </span>
          ) : (
            <span className="text-sm text-ink-500">{t.card.noReviews}</span>
          )}
          {p.fromPrice !== null && (
            <span className="text-sm font-semibold tabular-nums text-brand-700">
              {formatLKR(p.fromPrice, locale)}
              {p.fromPriceType && (
                <span className="font-normal text-ink-500">
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
