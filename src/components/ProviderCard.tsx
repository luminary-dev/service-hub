/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import Stars from "./Stars";
import Avatar from "./Avatar";
import { categoryIcon, categoryLabel, formatLKR, priceTypeLabel } from "@/lib/constants";

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

export default function ProviderCard({ p }: { p: ProviderSummary }) {
  return (
    <Link
      href={`/providers/${p.id}`}
      className="card group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-ink-200/60"
    >
      <div className="relative h-36 bg-gradient-to-br from-brand-50 to-ink-100">
        {p.coverPhoto ? (
          <img
            src={p.coverPhoto}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-5xl opacity-40">
            {categoryIcon(p.category)}
          </div>
        )}
        {p.available && (
          <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-brand-700 backdrop-blur">
            ● Available
          </span>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="-mt-9 rounded-full border-4 border-white">
            <Avatar name={p.name} url={p.avatarUrl} size={56} />
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <h3 className="truncate font-semibold text-ink-900 group-hover:text-brand-700">
              {p.name}
            </h3>
            <p className="text-xs text-ink-500">
              {categoryLabel(p.category)} · {p.city}, {p.district}
            </p>
          </div>
        </div>

        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-600">
          {p.headline}
        </p>

        <div className="mt-3 flex items-center justify-between">
          {p.rating !== null ? (
            <span className="flex items-center gap-1.5 text-sm">
              <Stars rating={p.rating} />
              <span className="font-medium text-ink-700">
                {p.rating.toFixed(1)}
              </span>
              <span className="text-ink-400">({p.reviewCount})</span>
            </span>
          ) : (
            <span className="text-sm text-ink-400">No reviews yet</span>
          )}
          {p.fromPrice !== null && (
            <span className="text-sm font-semibold text-brand-700">
              {formatLKR(p.fromPrice)}
              <span className="font-normal text-ink-400">
                {" "}
                {p.fromPriceType ? `· ${priceTypeLabel(p.fromPriceType)}` : ""}
              </span>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
