import Link from "next/link";
import { FaHeart } from "react-icons/fa6";
import { CATEGORIES } from "@/lib/constants";

export default function Footer() {
  return (
    <footer className="border-t border-ink-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">
                S
              </span>
              <span className="text-lg font-semibold tracking-tight text-ink-900">
                Service<span className="text-brand-600">Hub</span>
              </span>
            </div>
            <p className="mt-3 max-w-[36ch] text-sm leading-relaxed text-ink-600">
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
                    className="text-sm text-ink-600 transition-colors duration-200 hover:text-brand-700"
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
                  className="text-sm text-ink-600 transition-colors duration-200 hover:text-brand-700"
                >
                  Join as a Professional
                </Link>
              </li>
              <li>
                <Link
                  href="/login"
                  className="text-sm text-ink-600 transition-colors duration-200 hover:text-brand-700"
                >
                  Sign in
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard"
                  className="text-sm text-ink-600 transition-colors duration-200 hover:text-brand-700"
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
                  className="text-sm text-ink-600 transition-colors duration-200 hover:text-brand-700"
                >
                  Browse Professionals
                </Link>
              </li>
              <li>
                <Link
                  href="/register/customer"
                  className="text-sm text-ink-600 transition-colors duration-200 hover:text-brand-700"
                >
                  Create an Account
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex items-center gap-1.5 border-t border-ink-100 pt-6 text-sm text-ink-500">
          © {new Date().getFullYear()} ServiceHub. Made with
          <FaHeart className="h-3 w-3 text-brand-500" />
          for Sri Lanka
        </div>
      </div>
    </footer>
  );
}
