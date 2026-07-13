"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Moves keyboard focus to the returned element once, when it mounts. Used for
// form success views that replace an interactive form: without this the focused
// submit button is removed on success and focus falls back to <body>, stranding
// keyboard users and giving screen readers nothing to announce (#510). Pair with
// tabIndex={-1} so the target is programmatically focusable without joining the
// tab order.
export function useMoveFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}

// Announced, focus-catching confirmation shown when a form is replaced by its
// success/"sent" state (#510). role="status" + aria-live="polite" announces the
// message to assistive tech; focus moves to the heading so keyboard users stay
// oriented instead of being dropped on <body>. Callers own the surrounding
// chrome and pass their own classes so each form keeps its existing look.
export default function FormSuccess({
  title,
  icon,
  className,
  headingClassName = "font-semibold text-ink-900 focus:outline-none",
  children,
}: {
  title: ReactNode;
  icon?: ReactNode;
  className?: string;
  headingClassName?: string;
  children?: ReactNode;
}) {
  const headingRef = useMoveFocusOnMount<HTMLHeadingElement>();
  return (
    <div role="status" aria-live="polite" className={className}>
      {icon}
      <h3 ref={headingRef} tabIndex={-1} className={headingClassName}>
        {title}
      </h3>
      {children}
    </div>
  );
}
