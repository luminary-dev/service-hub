import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import Avatar from "@/components/Avatar";
import { FaUsers } from "@/components/icons";
import EmptyState from "@/components/ui/EmptyState";
import Pagination from "@/components/ui/Pagination";

// Caching (#57): admin-only view; edits must be visible on the next
// request — stays fully dynamic (no-store).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: dict[locale].titles.adminUsers };
}

// Listing as served by `GET /api/admin/users` on the gateway.
type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  role: "CUSTOMER" | "PROVIDER" | "ADMIN" | "SUPPORT";
  createdAt: string;
  locked: boolean;
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/");

  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const page = Math.max(1, Number(params.page) || 1);

  const query = new URLSearchParams();
  if (q) query.set("q", q);
  query.set("page", String(page));

  const [locale, data] = await Promise.all([
    getLocale(),
    apiJson<{
      users: AdminUserRow[];
      total: number;
      page: number;
      pageSize: number;
    }>(`/api/admin/users?${query.toString()}`),
  ]);
  const t = dict[locale].admin;
  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const roleLabel: Record<AdminUserRow["role"], string> = {
    CUSTOMER: t.roleCustomer,
    PROVIDER: t.roleProvider,
    ADMIN: t.roleAdmin,
    SUPPORT: t.roleSupport,
  };

  function pageHref(target: number) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    sp.set("page", String(target));
    return `/admin/users?${sp.toString()}`;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
        {t.usersTitle}
      </h1>
      <p className="mt-1 text-ink-600">{t.usersSubtitle}</p>

      <form method="GET" className="mt-6 flex max-w-md gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder={t.usersSearchPlaceholder}
          className="input"
        />
        <button type="submit" className="btn-secondary shrink-0">
          {t.usersSearch}
        </button>
      </form>

      {users.length === 0 ? (
        <EmptyState icon={FaUsers} title={t.usersEmpty} className="mt-8" />
      ) : (
        <ul className="mt-8 space-y-3">
          {users.map((u) => (
            <li
              key={u.id}
              className="card flex flex-wrap items-center justify-between gap-4 p-4"
            >
              <div className="flex items-center gap-3">
                <Avatar name={u.name} url={null} size={40} />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="font-semibold text-ink-900 hover:text-brand-700"
                    >
                      {u.name}
                    </Link>
                    <span className="chip bg-ink-100 text-ink-600">
                      {roleLabel[u.role]}
                    </span>
                    {u.locked && (
                      <span className="chip bg-red-50 text-red-700 ring-1 ring-red-200">
                        {t.lockedTag}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-ink-500">
                    {u.email} · {t.usersJoined} {formatDate(u.createdAt, locale)}
                  </p>
                </div>
              </div>
              <Link
                href={`/admin/users/${u.id}`}
                className="text-sm font-medium text-brand-700 hover:text-brand-800"
              >
                {t.moderate}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Pagination page={page} totalPages={totalPages} hrefFor={pageHref} locale={locale} />
    </div>
  );
}
