"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isSvg } from "@/lib/image";
import { useT } from "./I18nProvider";

export default function UserMenu({
  name,
  role,
  avatarUrl,
}: {
  name: string;
  role: string;
  avatarUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
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
    if (signingOut) return; // guard against a double-tap firing two POSTs
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setOpen(false);
      router.push("/");
      router.refresh();
    } catch {
      setSigningOut(false);
    }
  }

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      className="relative"
      ref={ref}
      // Escape closes the dropdown and returns focus to the trigger.
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        // Below sm the name span is hidden and the avatar alt is empty, so the
        // trigger needs an explicit accessible name (#565).
        aria-label={name}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-200 ease-snap hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt=""
            width={32}
            height={32}
            unoptimized={isSvg(avatarUrl)}
            className="h-8 w-8 rounded-sm object-cover"
          />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-brand-700 font-mono text-xs font-bold tabular-nums text-white dark:text-ink-50">
            {initials}
          </span>
        )}
        <span className="hidden text-sm font-medium text-ink-800 sm:block">
          {name.split(" ")[0]}
        </span>
        <svg
          aria-hidden
          className={`h-4 w-4 text-ink-500 transition-transform duration-200 ease-snap ${open ? "rotate-180" : ""}`}
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
        <div className="card absolute right-0 mt-2 w-56 overflow-hidden p-1 shadow-lg">
          {/* Signed-in header: name + mono role code, blueprint style. */}
          <div className="border-b border-ink-200 px-3 py-2.5">
            <div className="truncate font-display text-sm font-semibold text-ink-900">
              {name}
            </div>
            <div className="mt-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-700">
              {t.roles[role] ?? role}
            </div>
          </div>
          <div className="py-1">
            {role === "PROVIDER" && (
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="block rounded-md px-3 py-2 text-sm text-ink-700 transition-colors duration-200 ease-snap hover:bg-ink-100 hover:text-brand-700"
              >
                {t.nav.dashboard}
              </Link>
            )}
            {(role === "ADMIN" || role === "SUPPORT") && (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="block rounded-md px-3 py-2 text-sm text-ink-700 transition-colors duration-200 ease-snap hover:bg-ink-100 hover:text-brand-700"
              >
                {t.nav.admin}
              </Link>
            )}
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-2 text-sm text-ink-700 transition-colors duration-200 ease-snap hover:bg-ink-100 hover:text-brand-700"
            >
              {t.nav.account}
            </Link>
            <Link
              href="/account#saved"
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-2 text-sm text-ink-700 transition-colors duration-200 ease-snap hover:bg-ink-100 hover:text-brand-700"
            >
              {t.nav.saved}
            </Link>
            <Link
              href="/providers"
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-2 text-sm text-ink-700 transition-colors duration-200 ease-snap hover:bg-ink-100 hover:text-brand-700"
            >
              {t.nav.find}
            </Link>
            {/* Customer actions are session-gated, not role-gated (#402): a
                PROVIDER can post jobs / inquire / review too. Surface the
                post-a-job entry point for both customers and providers. */}
            {(role === "CUSTOMER" || role === "PROVIDER") && (
              <Link
                href="/jobs/new"
                onClick={() => setOpen(false)}
                className="block rounded-md px-3 py-2 text-sm text-ink-700 transition-colors duration-200 ease-snap hover:bg-ink-100 hover:text-brand-700"
              >
                {t.nav.postJob}
              </Link>
            )}
            {/* Become a provider (#401): entry point for existing customers. */}
            {role === "CUSTOMER" && (
              <Link
                href="/welcome/provider"
                onClick={() => setOpen(false)}
                className="block rounded-md px-3 py-2 text-sm text-ink-700 transition-colors duration-200 ease-snap hover:bg-ink-100 hover:text-brand-700"
              >
                {t.nav.becomeProvider}
              </Link>
            )}
          </div>
          <button
            type="button"
            onClick={logout}
            disabled={signingOut}
            className="block w-full cursor-pointer rounded-md border-t border-dashed border-ink-200 px-3 py-2 text-left text-sm text-red-600 transition-colors duration-200 ease-snap hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-red-950"
          >
            {t.nav.signOut}
          </button>
        </div>
      )}
    </div>
  );
}
