"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FaStar, FaXmark } from "react-icons/fa6";
import Stars from "./Stars";
import Avatar from "./Avatar";
import { isSvg } from "@/lib/image";
import { useLocale, useT } from "./I18nProvider";
import { useToast } from "./ToastProvider";
import { formatDate } from "@/lib/format";
import ReportButton from "./ReportButton";

type ReviewPhoto = { id: string; url: string };

type ReviewItem = {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  userName: string;
  photos: ReviewPhoto[];
};

const MAX_PHOTOS = 3;

export default function ReviewSection({
  providerId,
  reviews,
  canReview,
  signedIn,
  myReview,
}: {
  providerId: string;
  reviews: ReviewItem[];
  canReview: boolean;
  signedIn: boolean;
  myReview: { rating: number; comment: string; photos: ReviewPhoto[] } | null;
}) {
  const [rating, setRating] = useState(myReview?.rating ?? 5);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(myReview?.comment ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const t = useT();
  const toast = useToast();
  const locale = useLocale();

  const existingCount = myReview?.photos.length ?? 0;
  const slotsLeft = MAX_PHOTOS - existingCount;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const files = fileRef.current?.files;
    if (files && files.length > slotsLeft) {
      setError(t.reviews.tooManyPhotos(MAX_PHOTOS));
      return;
    }
    setLoading(true);
    setError("");
    const fd = new FormData();
    fd.append("rating", String(rating));
    fd.append("comment", comment);
    if (files) for (const f of Array.from(files)) fd.append("photos", f);

    const res = await fetch(`/api/providers/${providerId}/reviews`, {
      method: "POST",
      body: fd,
    });
    setLoading(false);
    if (res.ok) {
      setShowForm(false);
      if (fileRef.current) fileRef.current.value = "";
      toast.success(t.toast.reviewSaved);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t.reviews.error);
    }
  }

  async function removePhoto(photoId: string) {
    const res = await fetch(`/api/reviews/photos/${photoId}`, {
      method: "DELETE",
    }).catch(() => null);
    if (res && res.ok) router.refresh();
  }

  return (
    <section className="card p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink-900">
          {t.reviews.title(reviews.length)}
        </h2>
        {canReview && !showForm && (
          <button onClick={() => setShowForm(true)} className="btn-secondary">
            {myReview ? t.reviews.edit : t.reviews.write}
          </button>
        )}
        {!signedIn && (
          <Link
            href="/login"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            {t.reviews.signIn}
          </Link>
        )}
      </div>

      {showForm && (
        <form onSubmit={submit} className="mt-4 rounded-xl bg-ink-50 p-4">
          {/* The star picker is a button group, so it is named with
              aria-labelledby rather than an orphaned <label>. */}
          <span className="label" id="review-rating-label">
            {t.reviews.rating}
          </span>
          <div
            role="group"
            aria-labelledby="review-rating-label"
            className="flex gap-1"
          >
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setRating(i)}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(0)}
                aria-label={t.reviews.starLabel(i)}
                aria-pressed={rating === i}
                className="transition hover:scale-110"
              >
                <FaStar
                  aria-hidden
                  className={`h-6 w-6 ${
                    i <= (hover || rating) ? "text-amber-400" : "text-ink-300"
                  }`}
                />
              </button>
            ))}
          </div>
          <label className="label mt-3" htmlFor="review-comment">
            {t.reviews.yourReview}
          </label>
          <textarea
            id="review-comment"
            className="input min-h-24 resize-y"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            required
            minLength={3}
            placeholder={t.reviews.ph}
          />

          {myReview && myReview.photos.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {myReview.photos.map((ph) => (
                <div key={ph.id} className="relative">
                  <Image
                    src={ph.url}
                    alt=""
                    width={64}
                    height={64}
                    unoptimized={isSvg(ph.url)}
                    className="h-16 w-16 rounded-lg object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(ph.id)}
                    aria-label={t.reviews.removePhoto}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-ink-900 text-white dark:text-ink-50"
                  >
                    <FaXmark className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <label className="label mt-3" htmlFor="review-photos">
            {t.reviews.addPhotos}
          </label>
          <input
            id="review-photos"
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={slotsLeft <= 0}
            aria-describedby="review-photos-hint"
            className="input"
          />
          <p id="review-photos-hint" className="mt-1 text-xs text-ink-500">
            {t.reviews.photosHint(slotsLeft)}
          </p>

          {error && (
            <p role="alert" className="mt-2 text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? t.reviews.saving : t.reviews.submit}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="btn-ghost"
            >
              {t.reviews.cancel}
            </button>
          </div>
        </form>
      )}

      {reviews.length === 0 ? (
        <p className="mt-4 text-sm text-ink-500">{t.reviews.empty}</p>
      ) : (
        <ul className="mt-4 divide-y divide-ink-100">
          {reviews.map((r) => (
            <li key={r.id} className="py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={r.userName} size={36} />
                  <div>
                    <p className="text-sm font-medium text-ink-800">
                      {r.userName}
                    </p>
                    <div className="flex items-center gap-2">
                      <Stars
                        rating={r.rating}
                        label={t.a11y.rated(r.rating.toFixed(1))}
                      />
                      <span className="text-xs text-ink-500">
                        {formatDate(r.createdAt, locale)}
                      </span>
                    </div>
                  </div>
                </div>
                <ReportButton
                  endpoint={`/api/reviews/${r.id}/report`}
                  label={t.report.reportReview}
                  variant="text"
                  showLabel={false}
                />
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                {r.comment}
              </p>
              {r.photos.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.photos.map((ph) => (
                    <a
                      key={ph.id}
                      href={ph.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      // Image-only link: the alt text is the link's name.
                      className="block overflow-hidden rounded-lg border border-ink-200"
                    >
                      <Image
                        src={ph.url}
                        alt={t.profile.viewPhoto}
                        width={96}
                        height={96}
                        unoptimized={isSvg(ph.url)}
                        className="h-24 w-24 object-cover transition hover:opacity-90"
                      />
                    </a>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
