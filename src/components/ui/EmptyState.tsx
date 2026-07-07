import type { ReactNode } from "react";
import type { IconType } from "@/components/icons";

// UI 2.0 — empty / no-results state.
//
// The centered `.card` used when a listing or panel has nothing to show:
// a large muted icon, a title, a body line, an optional action (e.g. a
// "clear filters" button), and an optional `children` slot for page-specific
// extras (suggested categories, etc.). Mirrors the empty-results card in
// providers/page.tsx. Pass an icon component from `@/components/icons` — it is
// rendered at the standard size/tint. Server-safe.
export default function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  children,
  className = "",
}: {
  /** Icon component from `@/components/icons` (rendered at h-12 w-12). */
  icon?: IconType;
  title: ReactNode;
  body?: ReactNode;
  /** Optional call-to-action rendered below the body (e.g. a button/link). */
  action?: ReactNode;
  /** Optional extra content rendered under the action. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`card flex flex-col items-center px-6 py-16 text-center ${className}`}
    >
      {Icon && <Icon className="h-12 w-12 text-ink-300" />}
      <h2 className="mt-4 text-lg font-semibold text-ink-900">{title}</h2>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-500">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
      {children}
    </div>
  );
}
