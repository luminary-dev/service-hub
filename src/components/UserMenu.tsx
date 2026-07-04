"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useT } from "./I18nProvider";

export default function UserMenu({
  name,
  role,
}: {
  name: string;
  role: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const t = useT();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-ink-100"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
          {initials}
        </span>
        <span className="hidden text-sm font-medium text-ink-800 sm:block">
          {name.split(" ")[0]}
        </span>
        <svg
          className={`h-4 w-4 text-ink-500 transition ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-ink-200 bg-surface py-1 shadow-lg">
          {role === "PROVIDER" && (
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm text-ink-700 transition hover:bg-ink-50"
            >
              {t.nav.dashboard}
            </Link>
          )}
          {role === "ADMIN" && (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm text-ink-700 transition hover:bg-ink-50"
            >
              {t.nav.admin}
            </Link>
          )}
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm text-ink-700 transition hover:bg-ink-50"
          >
            {t.nav.saved}
          </Link>
          <Link
            href="/providers"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm text-ink-700 transition hover:bg-ink-50"
          >
            {t.nav.find}
          </Link>
          <button
            onClick={logout}
            className="block w-full cursor-pointer px-4 py-2.5 text-left text-sm text-red-600 transition hover:bg-red-50"
          >
            {t.nav.signOut}
          </button>
        </div>
      )}
    </div>
  );
}
