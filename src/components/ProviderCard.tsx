import Link from "next/link";
import Image from "next/image";
import Stars from "./Stars";
import Avatar from "./Avatar";
import CategoryIcon from "./CategoryIcon";
import FavoriteButton from "./FavoriteButton";
import { isSvg } from "@/lib/image";
import { formatLKR } from "@/lib/constants";
import {
  dict,
  categoryLabelLoc,
  districtLabelLoc,
  priceTypeLabelLoc,
  type Locale,
} from "@/lib/i18n";

export type ProviderSummary = {
  id: string;
  name: string;
  category: string;
  headline: string;
  district: string;
  city: string;
  experience: number;
  available: boolean;
  avatarUrl: string | null;
  coverPhoto: string | null;
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
  p: ProviderSummary;
  locale?: Locale;
  showFavorite?: boolean;
  favorited?: boolean;
}) {
  const t = dict[locale];
  return (
    <div className="relative">
      {showFavorite && (
        <div className="absolute right-3 top-3 z-10">
          <FavoriteButton providerId={p.id} initialFavorited={favorited} />
        </div>
      )}
      <Link
        href={`/providers/${p.id}`}
        className="card group block overflow-hidden transition-[border-color,transform] duration-200 ease-snap hover:-translate-y-1 hover:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 active:scale-[0.99]"
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
        {p.available && (
          <span className="chip absolute bottom-3 right-3 bg-white/95 text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {t.card.available}
          </span>
        )}
        {p.experience > 0 && (
          <span className="chip absolute left-3 top-3 bg-ink-900/75 text-white">
            {t.card.yrs(p.experience)}
          </span>
        )}
        </div>

      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="-mt-9 rounded-full border-4 border-white">
            <Avatar name={p.name} url={p.avatarUrl} size={56} />
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <h3 className="truncate font-semibold text-ink-900 transition-colors duration-200 group-hover:text-brand-700">
              {p.name}
            </h3>
            <p className="text-xs text-ink-500">
              {categoryLabelLoc(p.category, locale)} · {p.city},{" "}
              {districtLabelLoc(p.district, locale)}
            </p>
          </div>
        </div>

        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-600">
          {p.headline}
        </p>

        <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3">
          {p.rating !== null ? (
            <span className="flex items-center gap-1.5 text-sm">
              <Stars rating={p.rating} />
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
              {formatLKR(p.fromPrice)}
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
