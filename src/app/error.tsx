"use client";

import { useEffect } from "react";
import Link from "next/link";
import { FaTriangleExclamation } from "@/components/icons";
import { useT } from "@/components/I18nProvider";

// Route error boundary: renders inside the root layout (navbar and i18n
// provider stay available) with a retry that re-renders the failed segment.
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

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
        <button type="button" onClick={reset} className="btn-primary">
          {t.errors.retry}
        </button>
        <Link href="/" className="btn-secondary">
          {t.errors.goHome}
        </Link>
      </div>
    </div>
  );
}
