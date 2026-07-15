import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import Avatar from "@/components/Avatar";
import AdminUserActions from "@/components/admin/AdminUserActions";

// Caching (#57): admin-only view; edits must be visible on the next
// request — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: dict[locale].titles.adminUserDetail };
}

// Detail payload as served by `GET /api/admin/users/:id` on the gateway.
type AdminUserDetail = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: "CUSTOMER" | "PROVIDER" | "ADMIN" | "SUPPORT";
  createdAt: string;
  locked: boolean;
  sessionVersion: number;
  favorites: {
    providerId: string;
    createdAt: string;
    provider: { id: string; contactName: string; suspended: boolean } | null;
  }[];
};

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/");

  const { id } = await params;
  const [locale, data] = await Promise.all([
    getLocale(),
    apiJson<{ user: AdminUserDetail }>(`/api/admin/users/${encodeURIComponent(id)}`),
  ]);
  const user = data?.user ?? null;
  if (!user) notFound();
  const t = dict[locale].admin;

  const roleLabel: Record<AdminUserDetail["role"], string> = {
    CUSTOMER: t.roleCustomer,
    PROVIDER: t.roleProvider,
    ADMIN: t.roleAdmin,
    SUPPORT: t.roleSupport,
  };
  const isSelf = user.id === session.userId;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link
        href="/admin/users"
        className="text-sm font-medium text-brand-700 hover:text-brand-800"
      >
        ← {t.usersBack}
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={user.name} url={null} size={52} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
              {user.name}
            </h1>
            <p className="text-sm text-ink-500">
              {user.email} {user.phone ? `· ${user.phone}` : ""}
            </p>
          </div>
        </div>
        {isSelf ? (
          <p className="text-sm text-ink-500">{t.usersSelfNotice}</p>
        ) : (
          <AdminUserActions userId={user.id} role={user.role} locked={user.locked} />
        )}
      </div>

      <section className="card mt-8 grid grid-cols-2 gap-4 p-6 sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-500">
            {t.usersRole}
          </p>
          <p className="mt-1 font-semibold text-ink-900">{roleLabel[user.role]}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-500">
            {t.usersJoined}
          </p>
          <p className="mt-1 font-semibold text-ink-900">
            {formatDate(user.createdAt, locale)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-500">
            {t.lockedTag}
          </p>
          <p className="mt-1 font-semibold text-ink-900">
            {user.locked ? t.lockedTag : "—"}
          </p>
        </div>
      </section>

      <section className="card mt-6 p-6">
        <h2 className="font-semibold text-ink-900">{t.usersFavoritesHeading}</h2>
        {user.favorites.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">{t.usersNoFavorites}</p>
        ) : (
          <ul className="mt-4 divide-y divide-ink-100">
            {user.favorites.map((f) => (
              <li
                key={f.providerId}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="min-w-0">
                  {f.provider ? (
                    <Link
                      href={`/admin/providers/${f.provider.id}`}
                      className="text-sm font-medium text-ink-800 hover:text-brand-700"
                    >
                      {f.provider.contactName}
                    </Link>
                  ) : (
                    <span className="text-sm text-ink-500">{f.providerId}</span>
                  )}
                  {f.provider?.suspended && (
                    <span className="chip ml-2 bg-red-50 text-red-700 ring-1 ring-red-200">
                      {t.suspendedTag}
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-xs text-ink-500">
                  {formatDate(f.createdAt, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
