import type { ReactNode } from "react";

// UI 2.0 — form-field scaffolding.
//
// `Field` pairs a `.label` with a control (its children — an `.input`,
// <select>, <textarea>, PasswordInput, …) plus optional help and error text,
// matching the field blocks used throughout register/provider. Wire `htmlFor`
// to the control's `id` for label association; the error takes precedence over
// help and is announced via `role="alert"`. `FormRow` is the sibling grid
// used to lay two/three fields side by side (the `sm:grid-cols-*` rows in the
// form). Both are server-safe — the interactive control is supplied by the
// caller.
export function Field({
  label,
  htmlFor,
  help,
  error,
  children,
  className = "",
}: {
  label: ReactNode;
  /** `id` of the control this label points at. */
  htmlFor?: string;
  /** Hint shown under the control when there is no error. */
  help?: ReactNode;
  /** Error message; when set it replaces the help text. */
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : help ? (
        <p className="mt-1 text-xs text-ink-500">{help}</p>
      ) : null}
    </div>
  );
}

// Responsive grid that arranges multiple <Field>s in a row (single column on
// mobile, `cols` columns from the `sm` breakpoint up).
export function FormRow({
  cols = 2,
  children,
  className = "",
}: {
  cols?: 2 | 3;
  children: ReactNode;
  className?: string;
}) {
  const colClass = cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
  return (
    <div className={`grid gap-4 ${colClass} ${className}`}>{children}</div>
  );
}
