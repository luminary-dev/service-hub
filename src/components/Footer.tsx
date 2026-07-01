import Link from "next/link";
import { CATEGORIES } from "@/lib/constants";

export default function Footer() {
  return (
    <footer className="border-t border-ink-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
                S
              </span>
              <span className="text-lg font-bold tracking-tight text-ink-900">
                Service<span className="text-brand-600">Hub</span>
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink-500">
              Connecting Sri Lankan homes and businesses with trusted local
              professionals.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink-900">
              Popular Services
            </h3>
            <ul className="mt-3 space-y-2">
              {CATEGORIES.slice(0, 6).map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/providers?category=${c.slug}`}
                    className="text-sm text-ink-500 transition hover:text-brand-600"
                  >
                    {c.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink-900">
              For Professionals
            </h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link
                  href="/register/provider"
                  className="text-sm text-ink-500 transition hover:text-brand-600"
                >
                  Join as a Professional
                </Link>
              </li>
              <li>
                <Link
                  href="/login"
                  className="text-sm text-ink-500 transition hover:text-brand-600"
                >
                  Sign in
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard"
                  className="text-sm text-ink-500 transition hover:text-brand-600"
                >
                  Dashboard
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink-900">
              For Customers
            </h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link
                  href="/providers"
                  className="text-sm text-ink-500 transition hover:text-brand-600"
                >
                  Browse Professionals
                </Link>
              </li>
              <li>
                <Link
                  href="/register/customer"
                  className="text-sm text-ink-500 transition hover:text-brand-600"
                >
                  Create an Account
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-ink-100 pt-6 text-sm text-ink-400">
          © {new Date().getFullYear()} ServiceHub. Made for Sri Lanka 🇱🇰
        </div>
      </div>
    </footer>
  );
}
