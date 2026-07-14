"use client";

import { useEffect } from "react";
import Link from "next/link";
import { FaTriangleExclamation } from "@/components/icons";
import { useLocale, useT } from "@/components/I18nProvider";
import { localizedHref } from "@/lib/links";

// UI 2.0 — the shared route error boundary UI (#381): every `error.tsx`
// (root and segment-level) renders this, so a throw anywhere shows the same
// localized message with a retry that re-fetches and re-renders only the
// failed segment (`unstable_retry`, falling back to `reset`). Segment
// boundaries keep their surrounding layout (navbar, admin nav) alive.
export default function RouteError({
  error,
  unstable_retry,
  reset,
}: {
  error: Error & { digest?: string };
  unstable_retry?: () => void;
  reset?: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const retry = unstable_retry ?? reset;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <FaTriangleExclamation className="h-16 w-16 text-ink-300" />
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-ink-900">
        {t.errors.errorTitle}
      </h1>
      <p className="mt-2 text-ink-500">{t.errors.errorBody}</p>
      <div className="mt-8 flex gap-3">
        <button type="button" onClick={retry} className="btn-primary">
          {t.errors.retry}
        </button>
        <Link href={localizedHref("/", locale)} className="btn-secondary">
          {t.errors.goHome}
        </Link>
      </div>
    </div>
  );
}
