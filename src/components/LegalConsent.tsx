"use client";

import Link from "next/link";
import { useLocale, useT } from "@/components/I18nProvider";
import { localizedHref } from "@/lib/links";

// Registration consent (#62). ConsentCheckbox is the required tick on the
// email registration forms; ConsentNotice is the passive "by continuing you
// agree" line under the social sign-in buttons.

function LegalLinks() {
  const locale = useLocale();
  const t = useT().legal;
  const linkClass = "font-medium text-brand-600 underline hover:text-brand-700";
  return (
    <>
      <Link href={localizedHref("/terms", locale)} className={linkClass}>
        {t.terms}
      </Link>
      {t.agreeJoin}
      <Link href={localizedHref("/privacy", locale)} className={linkClass}>
        {t.privacy}
      </Link>
    </>
  );
}

export function ConsentCheckbox({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const t = useT().legal;
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-600"
    >
      <input
        id={id}
        type="checkbox"
        required
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand-700"
      />
      <span>
        {t.agreePrefix}
        <LegalLinks />
        {t.agreeSuffix}
      </span>
    </label>
  );
}

export function ConsentNotice() {
  const t = useT().legal;
  return (
    <p className="mt-3 text-center text-xs text-ink-500">
      {t.continuePrefix}
      <LegalLinks />
      {t.continueSuffix}
    </p>
  );
}
