"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FaStar } from "react-icons/fa6";
import Stars from "./Stars";
import Avatar from "./Avatar";
import { useT } from "./I18nProvider";

type ReviewItem = {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  userName: string;
};

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
  myReview: { rating: number; comment: string } | null;
}) {
  const [rating, setRating] = useState(myReview?.rating ?? 5);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(myReview?.comment ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const router = useRouter();
  const t = useT();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch(`/api/providers/${providerId}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, comment }),
    });
    setLoading(false);
    if (res.ok) {
      setShowForm(false);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t.reviews.error);
    }
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
          <label className="label">{t.reviews.rating}</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setRating(i)}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(0)}
                className="transition hover:scale-110"
              >
                <FaStar
                  className={`h-6 w-6 ${
                    i <= (hover || rating) ? "text-amber-400" : "text-ink-300"
                  }`}
                />
              </button>
            ))}
          </div>
          <label className="label mt-3">{t.reviews.yourReview}</label>
          <textarea
            className="input min-h-24 resize-y"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            required
            minLength={3}
            placeholder={t.reviews.ph}
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
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
              <div className="flex items-center gap-3">
                <Avatar name={r.userName} size={36} />
                <div>
                  <p className="text-sm font-medium text-ink-800">
                    {r.userName}
                  </p>
                  <div className="flex items-center gap-2">
                    <Stars rating={r.rating} />
                    <span className="text-xs text-ink-500">
                      {new Date(r.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                {r.comment}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
