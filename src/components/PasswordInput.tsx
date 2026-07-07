"use client";

import { useState } from "react";
import { FaEye, FaEyeSlash } from "@/components/icons";
import { useT } from "./I18nProvider";

// A password field with a show/hide (eye) toggle, like most sites. Drop-in for
// `<input type="password" className="input" .../>` — forwards every input prop
// (id, value, onChange, required, autoComplete, aria-*, …). The trailing button
// reserves space via pr-10 so typed text never sits under the icon.
type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

export default function PasswordInput({ className = "input", ...props }: Props) {
  const [show, setShow] = useState(false);
  const t = useT();
  const label = show ? t.a11y.hidePassword : t.a11y.showPassword;

  return (
    <div className="relative">
      <input
        {...props}
        type={show ? "text" : "password"}
        className={`${className} pr-10`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={label}
        aria-pressed={show}
        title={label}
        className="absolute inset-y-0 right-0 flex cursor-pointer items-center rounded-r-lg px-3 text-ink-500 transition hover:text-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        {show ? (
          <FaEyeSlash aria-hidden className="h-4 w-4" />
        ) : (
          <FaEye aria-hidden className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
