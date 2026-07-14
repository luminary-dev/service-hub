"use client";

import { useState } from "react";
import type { IconType } from "@/components/icons";
import {
  FaEnvelope,
  FaFacebookF,
  FaGlobe,
  FaInstagram,
  FaPhone,
  FaTiktok,
  FaWhatsapp,
  FaYoutube,
} from "@/components/icons";
import { useT } from "./I18nProvider";

function normalizeUrl(v: string) {
  return v.startsWith("http") ? v : `https://${v}`;
}

// The digits + email fetched on demand from POST /api/providers/:id/contact.
type Contact = {
  phone: string | null;
  whatsapp: string | null;
  phone2: string | null;
  email: string | null;
};

// Phone/WhatsApp numbers AND the email address are PII and easy to scrape, so
// the server keeps them out of the profile payload (#64/#655) — it only tells
// us whether each exists (has* flags). We reveal the real values on an explicit
// tap, fetching them from a rate-limited endpoint, so anonymous page HTML never
// carries them. Social links are public handles, not contact details, so they
// render inline.
export default function ContactLinks(props: {
  providerId: string;
  hasPhone: boolean;
  hasWhatsapp: boolean;
  hasPhone2: boolean;
  hasEmail: boolean;
  facebook: string | null;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  website: string | null;
  altLabel?: string;
}) {
  const t = useT();
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const hasAnyContact =
    props.hasPhone || props.hasWhatsapp || props.hasPhone2 || props.hasEmail;

  async function reveal() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/providers/${props.providerId}/contact`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("reveal failed");
      setContact((await res.json()) as Contact);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  const socials: { label: string; value: string | null; icon: IconType; bg: string }[] = [
    { label: "Facebook", value: props.facebook, icon: FaFacebookF, bg: "bg-blue-600" },
    {
      label: "Instagram",
      value: props.instagram,
      icon: FaInstagram,
      bg: "bg-gradient-to-tr from-amber-500 via-pink-600 to-purple-600",
    },
    { label: "TikTok", value: props.tiktok, icon: FaTiktok, bg: "bg-black dark:bg-ink-100" },
    { label: "YouTube", value: props.youtube, icon: FaYoutube, bg: "bg-red-600" },
    { label: "Website", value: props.website, icon: FaGlobe, bg: "bg-ink-600 dark:bg-ink-300" },
  ].filter((s) => s.value);

  return (
    <div className="flex flex-col items-start gap-3 sm:items-end">
      {hasAnyContact && !contact && (
        <button
          type="button"
          onClick={reveal}
          disabled={loading}
          className="btn-primary !px-4 !py-2"
        >
          <FaPhone className="h-3.5 w-3.5" />
          {loading ? t.profile.revealing : t.profile.showNumber}
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {t.profile.revealError}
        </p>
      )}
      {contact && (
        <>
          <div className="flex flex-wrap gap-2">
            {contact.phone && (
              <a href={`tel:${contact.phone}`} className="btn-primary !px-4 !py-2">
                <FaPhone className="h-3.5 w-3.5" /> {contact.phone}
              </a>
            )}
            {contact.whatsapp && (
              <a
                href={`https://wa.me/${contact.whatsapp.replace(/[^0-9]/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
              >
                <FaWhatsapp className="h-4 w-4" /> WhatsApp
              </a>
            )}
          </div>
          {contact.phone2 && (
            <p className="text-sm text-ink-500">
              {props.altLabel ?? "Alt:"} {contact.phone2}
            </p>
          )}
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="inline-flex items-center gap-2 text-sm font-medium text-brand-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
            >
              <FaEnvelope className="h-3.5 w-3.5" /> {contact.email}
            </a>
          )}
        </>
      )}
      {socials.length > 0 && (
        <div className="flex gap-2">
          {socials.map((s) => (
            <a
              key={s.label}
              href={normalizeUrl(s.value!)}
              target="_blank"
              rel="noopener noreferrer"
              title={s.label}
              aria-label={s.label}
              className={`flex h-10 w-10 items-center justify-center rounded-full text-white transition duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 ${s.bg}`}
            >
              <s.icon className="h-4 w-4" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
