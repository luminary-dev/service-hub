"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// Shared form-error a11y plumbing (#378) — the failure-side counterpart of
// FormSuccess (#510). Forms validate in JS on submit (with `noValidate` so
// native browser bubbles don't preempt them), keep the resulting messages in
// a `FieldErrors` map keyed by control id, and surface them three ways:
//   - inline next to the field (via `Field`'s `error` prop or a manual
//     `<p id="<id>-error" role="alert">`), linked to the control with
//     `aria-describedby`/`aria-invalid`;
//   - focus moved to the first invalid control (`useFieldErrors().show`);
//   - or, for multi-step forms, a focus-managed `ErrorSummary` listing every
//     problem with in-page links to the offending fields.
// Server/submit failures use `FormError`, which announces and takes focus so
// the failure is never silent.

export type FieldErrors = Record<string, string>;

// Same pragmatic shape the provider wizard has always used.
export const isValidEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value);

// Holds per-field validation errors keyed by the control's DOM id.
// `show(errors)` stores them and focuses the first invalid control (insertion
// order = field order), returning true when submission must stop.
// `errorProps(id)` yields the aria wiring for controls not rendered through
// `Field` — the message element must have the id `<id>-error`.
export function useFieldErrors() {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const show = useCallback((errors: FieldErrors) => {
    setFieldErrors(errors);
    const first = Object.keys(errors)[0];
    if (first) document.getElementById(first)?.focus();
    return Boolean(first);
  }, []);

  const errorProps = useCallback(
    (id: string) =>
      fieldErrors[id]
        ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` }
        : {},
    [fieldErrors],
  );

  return { fieldErrors, setFieldErrors, show, errorProps };
}

// Form-level (submit/server) error. role="alert" announces it and focus moves
// onto it when it appears, so keyboard and screen-reader users land on the
// failure instead of a silently re-enabled submit button.
export function FormError({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (children) ref.current?.focus();
  }, [children]);
  if (!children) return null;
  return (
    <p
      ref={ref}
      tabIndex={-1}
      role="alert"
      className={`text-sm text-red-600 focus:outline-none ${className}`}
    >
      {children}
    </p>
  );
}

// Focus-managed error summary for multi-step forms (the provider wizard):
// lists every validation problem on the current step as an in-page link that
// moves focus to the offending field. Each entry carries the `<id>-error` id
// so the field itself can reference it via aria-describedby.
export function ErrorSummary({
  title,
  errors,
  className = "",
}: {
  title: string;
  errors: FieldErrors;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const count = Object.keys(errors).length;
  useEffect(() => {
    if (count) ref.current?.focus();
  }, [errors, count]);
  if (!count) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      className={`rounded-sm border border-red-600/40 bg-red-600/5 p-4 text-sm text-red-600 focus:outline-none ${className}`}
    >
      <p className="font-semibold">{title}</p>
      <ul className="mt-2 list-inside list-disc space-y-1">
        {Object.entries(errors).map(([id, message]) => (
          <li key={id} id={`${id}-error`}>
            <a
              href={`#${id}`}
              className="underline underline-offset-2 hover:text-red-700"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(id)?.focus();
              }}
            >
              {message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
