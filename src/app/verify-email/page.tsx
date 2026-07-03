"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { FaCircleCheck, FaCircleXmark } from "react-icons/fa6";
import { useT } from "@/components/I18nProvider";

type State = "loading" | "success" | "fail";

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
    return <p className="text-center text-sm text-ink-500">{t.verify.verifying}</p>;
  }

  if (state === "success") {
    return (
      <div className="card flex flex-col items-center p-8 text-center">
        <FaCircleCheck className="h-10 w-10 text-emerald-500" />
        <h1 className="mt-4 text-xl font-semibold text-ink-900">
          {t.verify.successTitle}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">
          {t.verify.successBody}
        </p>
        <div className="mt-6 flex gap-3">
          <Link href="/dashboard" className="btn-primary">
            {t.verify.goDashboard}
          </Link>
          <Link href="/" className="btn-secondary">
            {t.verify.goHome}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card flex flex-col items-center p-8 text-center">
      <FaCircleXmark className="h-10 w-10 text-red-500" />
      <h1 className="mt-4 text-xl font-semibold text-ink-900">
        {t.verify.failTitle}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">
        {t.verify.failBody}
      </p>
      <Link href="/login" className="btn-primary mt-6">
        {t.verify.signIn}
      </Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
      <Suspense>
        <VerifyInner />
      </Suspense>
    </div>
  );
}
