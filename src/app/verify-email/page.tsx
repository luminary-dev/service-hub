"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { FaCircleCheck, FaCircleXmark } from "@/components/icons";
import { useMoveFocusOnMount } from "@/components/FormSuccess";
import { useT } from "@/components/I18nProvider";

type State = "loading" | "success" | "fail";

// Announced, focus-catching result card (#378): the loading→success/fail swap
// used to happen silently — no live region, no focus move — so screen-reader
// users heard nothing. role="status"/"alert" announces the outcome and focus
// moves to the heading, mirroring the FormSuccess pattern (#510).
function ResultCard({
  tone,
  icon,
  title,
  body,
  children,
}: {
  tone: "success" | "fail";
  icon: ReactNode;
  title: string;
  body: string;
  children: ReactNode;
}) {
  const headingRef = useMoveFocusOnMount<HTMLHeadingElement>();
  return (
    <div
      role={tone === "fail" ? "alert" : "status"}
      className="tech-corners card flex flex-col items-center border-ink-300 p-8 text-center"
    >
      {icon}
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-4 text-xl font-semibold text-ink-900 focus:outline-none"
      >
        {title}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">{body}</p>
      {children}
    </div>
  );
}

function VerifyInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<State>(token ? "loading" : "fail");
  const ran = useRef(false);
  const t = useT();

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    fetch("/api/auth/verify-email", {
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
        className="tech-corners card flex flex-col items-center border-ink-300 p-8 text-center"
      >
        <span className="pulse-dot h-2.5 w-2.5 rounded-full bg-brand-600" />
        <p className="mt-4 font-mono text-sm uppercase tracking-[0.12em] text-ink-500">
          {t.verify.verifying}
        </p>
      </div>
    );
  }

  if (state === "success") {
    return (
      <ResultCard
        tone="success"
        icon={<FaCircleCheck className="h-10 w-10 text-emerald-500" />}
        title={t.verify.successTitle}
        body={t.verify.successBody}
      >
        <div className="mt-6 flex gap-3">
          <Link href="/dashboard" className="btn-primary">
            {t.verify.goDashboard}
          </Link>
          <Link href="/" className="btn-secondary">
            {t.verify.goHome}
          </Link>
        </div>
      </ResultCard>
    );
  }

  return (
    <ResultCard
      tone="fail"
      icon={<FaCircleXmark className="h-10 w-10 text-red-500" />}
      title={t.verify.failTitle}
      body={t.verify.failBody}
    >
      <Link href="/login" className="btn-primary mt-6">
        {t.verify.signIn}
      </Link>
    </ResultCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="blueprint-grid">
      <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
        <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
          <span className="rounded-sm bg-brand-700 px-1.5 py-0.5 text-white dark:text-ink-50">
            AUTH
          </span>
          <span className="text-ink-500">VERIFY-EMAIL</span>
        </div>
        <div className="mt-8">
          <Suspense>
            <VerifyInner />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
