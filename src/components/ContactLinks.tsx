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
}) {
  const socials = [
    { label: "Facebook", value: props.facebook, icon: "f", bg: "bg-blue-600" },
    {
      label: "Instagram",
      value: props.instagram,
      icon: "IG",
      bg: "bg-gradient-to-tr from-amber-500 via-pink-600 to-purple-600",
    },
    { label: "TikTok", value: props.tiktok, icon: "TT", bg: "bg-ink-900" },
    { label: "YouTube", value: props.youtube, icon: "▶", bg: "bg-red-600" },
    { label: "Website", value: props.website, icon: "🌐", bg: "bg-ink-600" },
  ].filter((s) => s.value);

  return (
    <div className="flex flex-col items-start gap-3 sm:items-end">
      <div className="flex flex-wrap gap-2">
        {props.phone && (
          <a href={`tel:${props.phone}`} className="btn-primary !px-4 !py-2">
            📞 {props.phone}
          </a>
        )}
        {props.whatsapp && (
          <a
            href={`https://wa.me/${props.whatsapp.replace(/[^0-9]/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95"
          >
            WhatsApp
          </a>
        )}
      </div>
      {props.phone2 && (
        <p className="text-sm text-ink-500">Alt: {props.phone2}</p>
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
              className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white transition hover:scale-105 ${s.bg}`}
            >
              {s.icon}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
