"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { FaCircleCheck, FaCircleXmark } from "@/components/icons";
import { useLocale, useT } from "@/components/I18nProvider";
import { localizedHref } from "@/lib/links";

type State = "loading" | "success" | "fail";

function ConfirmInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<State>(token ? "loading" : "fail");
  const ran = useRef(false);
  const t = useT();
  const locale = useLocale();

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    fetch("/api/account/email/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((res) => setState(res.ok ? "success" : "fail"))
      .catch(() => setState("fail"));
  }, [token]);

  if (state === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="tech-corners card flex flex-col items-center border-ink-300 p-8 text-center"
      >
        <span className="pulse-dot h-2.5 w-2.5 rounded-full bg-brand-600" />
        <p className="mt-4 font-mono text-sm uppercase tracking-[0.12em] text-ink-500">
          {t.verify.changeVerifying}
        </p>
      </div>
    );
  }

  if (state === "success") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="tech-corners card flex flex-col items-center border-ink-300 p-8 text-center"
      >
        <FaCircleCheck className="h-10 w-10 text-emerald-500" />
        <h1 className="mt-4 text-xl font-semibold text-ink-900">
          {t.verify.changeSuccessTitle}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">
          {t.verify.changeSuccessBody}
        </p>
        <Link href={localizedHref("/account", locale)} className="btn-primary mt-6">
          {t.verify.goAccount}
        </Link>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="tech-corners card flex flex-col items-center border-ink-300 p-8 text-center"
    >
      <FaCircleXmark className="h-10 w-10 text-red-500" />
      <h1 className="mt-4 text-xl font-semibold text-ink-900">
        {t.verify.changeFailTitle}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">
        {t.verify.changeFailBody}
      </p>
      <Link href={localizedHref("/account", locale)} className="btn-primary mt-6">
        {t.verify.goAccount}
      </Link>
    </div>
  );
}

export default function VerifyEmailChangePage() {
  return (
    <div className="blueprint-grid">
      <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
        <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
          <span className="rounded-sm bg-brand-700 px-1.5 py-0.5 text-white dark:text-ink-50">
            AUTH
          </span>
          <span className="text-ink-500">CHANGE-EMAIL</span>
        </div>
        <div className="mt-8">
          <Suspense>
            <ConfirmInner />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
