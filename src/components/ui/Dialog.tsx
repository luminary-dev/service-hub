"use client";

import {
  useEffect,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { useFocusTrap } from "@/components/useFocusTrap";
import { useScrollLock } from "@/components/useScrollLock";

// A ref that only needs to be read — covariant, so refs to specific element
// types (select, button, …) are accepted.
type FocusRef = { readonly current: HTMLElement | null };

// UI 2.0 — shared modal dialog behavior (#381): overlay + focus trap + scroll
// lock + Escape-to-close + focus restore in one place, so a future modal
// author can't omit the a11y wiring. Render it only while open
// (`{open && <Dialog …>}`): mounting captures the opener and moves focus in,
// unmounting hands focus back.
//
// Two shapes:
// - panel mode (`panelClassName` set): a centered panel carries
//   `role="dialog"` and clicks inside it never close (e.g. ReportButton).
// - bare mode (no `panelClassName`): the overlay itself is the dialog and
//   children lay out freely inside it (e.g. the photo lightbox).
export default function Dialog({
  onClose,
  label,
  overlayClassName = "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4",
  panelClassName,
  initialFocus,
  restoreFocus,
  isolate = false,
  overlayProps,
  children,
}: {
  onClose: () => void;
  /** Accessible name for the dialog. */
  label: string;
  /** Classes for the fixed full-screen overlay (clicking it closes). */
  overlayClassName?: string;
  /** Classes for the centered panel; omit to put the dialog role on the overlay. */
  panelClassName?: string;
  /** Focused when the dialog opens (defaults to the dialog element itself). */
  initialFocus?: FocusRef;
  /** Receives focus back on close (defaults to the element focused at open). */
  restoreFocus?: FocusRef;
  /** Stop Escape/click/touch from reaching a dialog underneath (stacked modals). */
  isolate?: boolean;
  /** Extra overlay handlers (e.g. the lightbox swipe touch events). */
  overlayProps?: HTMLAttributes<HTMLDivElement>;
  children: ReactNode;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useFocusTrap(overlayRef, true);
  useScrollLock(true);

  // Focus in on mount, back out on unmount. Escape listens on window so it
  // works wherever focus sits; an `isolate` dialog stops the event at its
  // overlay first (below), so a stacked dialog underneath never sees it.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    (initialFocus?.current ?? panelRef.current ?? overlayRef.current)?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // Read at close time on purpose: the restore target (e.g. the lightbox
      // thumbnail that opened us) can change while the dialog is open.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      (restoreFocus?.current ?? opener)?.focus();
    };
  }, [initialFocus, restoreFocus]);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const overlayHandlers = {
    onClick: (e: React.MouseEvent) => {
      if (isolate) e.stopPropagation();
      onClose();
    },
    onKeyDown: isolate
      ? (e: React.KeyboardEvent) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }
      : undefined,
    onTouchStart: isolate ? stop : undefined,
    onTouchEnd: isolate ? stop : undefined,
  };
  const dialogA11y = {
    role: "dialog",
    "aria-modal": true,
    "aria-label": label,
    tabIndex: -1,
  } as const;

  if (panelClassName === undefined) {
    return (
      <div
        ref={overlayRef}
        {...dialogA11y}
        className={overlayClassName}
        {...overlayHandlers}
        {...overlayProps}
      >
        {children}
      </div>
    );
  }
  return (
    <div
      ref={overlayRef}
      className={overlayClassName}
      {...overlayHandlers}
      {...overlayProps}
    >
      <div
        ref={panelRef}
        {...dialogA11y}
        className={panelClassName}
        onClick={stop}
      >
        {children}
      </div>
    </div>
  );
}
