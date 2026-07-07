import Link from "next/link";
import { redirect } from "next/navigation";
import { FaFlag, FaShieldHalved, FaTags, FaUsers, type IconType } from "@/components/icons";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import NotificationBadge from "@/components/admin/NotificationBadge";
import type { NotificationQueue } from "@/lib/adminNotifications";

// Caching (#57): admin-only moderation view; edits must be visible on the
// next request — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

type Card = {
  href: string;
  icon: IconType;
  title: string;
  desc: string;
  // Which queue's notification badge (#233) to show on this card, if any.
  badgeQueue?: NotificationQueue;
};

export default async function AdminHomePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/");

  const t = dict[await getLocale()].admin;

  const cards: Card[] = [
    {
      href: "/admin/providers",
      icon: FaUsers,
      title: t.providersLink,
      desc: t.providersDesc,
    },
    {
      href: "/admin/verifications",
      icon: FaShieldHalved,
      title: t.verificationsLink,
      desc: t.verificationsDesc,
      badgeQueue: "verifications",
    },
    {
      href: "/admin/categories",
      icon: FaTags,
      title: t.categoriesLink,
      desc: t.categoriesDesc,
    },
    {
      href: "/admin/reports",
      icon: FaFlag,
      title: t.reportsLink,
      desc: t.reportsDesc,
      badgeQueue: "reports",
    },
    {
      href: "/admin/jobs",
      icon: FaBriefcase,
      title: t.jobsLink,
      desc: t.jobsDesc,
    },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
        {t.indexTitle}
      </h1>
      <p className="mt-1 text-ink-600">{t.indexSubtitle}</p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="card group p-6 transition-[border-color,transform] duration-200 ease-snap hover:-translate-y-1 hover:border-brand-400"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <c.icon className="h-5 w-5" />
            </span>
            <h2 className="mt-4 flex items-center font-semibold text-ink-900 group-hover:text-brand-700">
              {c.title}
              {c.badgeQueue && <NotificationBadge queue={c.badgeQueue} />}
            </h2>
            <p className="mt-1 text-sm text-ink-600">{c.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
