import Link from "next/link";
import { getSession } from "@/lib/auth";
import UserMenu from "./UserMenu";

export default async function Navbar() {
  const session = await getSession();

  return (
    <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/85 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">
            S
          </span>
          <span className="text-lg font-semibold tracking-tight text-ink-900">
            Service<span className="text-brand-600">Hub</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 sm:flex">
          <Link href="/providers" className="btn-ghost">
            Find Professionals
          </Link>
          {!session && (
            <Link href="/register/provider" className="btn-ghost">
              Offer Your Services
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2">
          {session ? (
            <UserMenu name={session.name} role={session.role} />
          ) : (
            <>
              <Link href="/login" className="btn-ghost">
                Sign in
              </Link>
              <Link href="/register" className="btn-primary !px-4 !py-2">
                Get Started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
