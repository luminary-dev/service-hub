import type { IconType } from "react-icons";
import {
  FaFacebookF,
  FaGlobe,
  FaInstagram,
  FaPhone,
  FaTiktok,
  FaWhatsapp,
  FaYoutube,
} from "react-icons/fa6";

function normalizeUrl(v: string) {
  return v.startsWith("http") ? v : `https://${v}`;
}

export default function ContactLinks(props: {
  phone: string | null;
  whatsapp: string | null;
  phone2: string | null;
  facebook: string | null;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  website: string | null;
  altLabel?: string;
}) {
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
      <div className="flex flex-wrap gap-2">
        {props.phone && (
          <a href={`tel:${props.phone}`} className="btn-primary !px-4 !py-2">
            <FaPhone className="h-3.5 w-3.5" /> {props.phone}
          </a>
        )}
        {props.whatsapp && (
          <a
            href={`https://wa.me/${props.whatsapp.replace(/[^0-9]/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95"
          >
            <FaWhatsapp className="h-4 w-4" /> WhatsApp
          </a>
        )}
      </div>
      {props.phone2 && (
        <p className="text-sm text-ink-500">
          {props.altLabel ?? "Alt:"} {props.phone2}
        </p>
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
