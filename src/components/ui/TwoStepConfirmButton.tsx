"use client";

import { useState, type ReactNode } from "react";

// Shared two-step confirmation (#916) for critical/destructive actions: the
// trigger swaps for a Confirm/Cancel pair instead of acting immediately, so a
// single accidental click/tap can never fire the action. Markup is left to
// each caller (compact inline pill vs. a full danger-zone panel look very
// different) — this owns just the confirm/cancel/pending state machine.
export default function TwoStepConfirmButton({
  triggerLabel,
  triggerAriaLabel,
  triggerTitle,
  icon,
  confirmPrompt,
  confirmLabel,
  pendingLabel,
  cancelLabel,
  onConfirm,
  disabled = false,
  wrapperClassName = "flex flex-col gap-2",
  buttonRowClassName = "flex flex-wrap gap-2",
  promptClassName = "text-sm font-medium text-ink-800",
  triggerClassName,
  confirmClassName,
  cancelClassName,
}: {
  triggerLabel: ReactNode;
  /** Accessible-name override for the trigger (e.g. explaining why it's disabled). */
  triggerAriaLabel?: string;
  triggerTitle?: string;
  icon?: ReactNode;
  /** Shown above (or beside, via `wrapperClassName`) the Confirm/Cancel pair. */
  confirmPrompt?: ReactNode;
  confirmLabel: ReactNode;
  /** Shown on the confirm button instead of `confirmLabel` while pending. */
  pendingLabel?: ReactNode;
  cancelLabel: ReactNode;
  // Return `false` to stay in the confirming state (e.g. the action failed
  // and the caller wants the Confirm/Cancel pair to stay put for a retry,
  // alongside its own inline error message). Anything else collapses back
  // to the trigger.
  onConfirm: () => Promise<boolean | void> | boolean | void;
  disabled?: boolean;
  wrapperClassName?: string;
  buttonRowClassName?: string;
  promptClassName?: string;
  triggerClassName: string;
  confirmClassName: string;
  cancelClassName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    try {
      const result = await onConfirm();
      if (result !== false) setConfirming(false);
    } finally {
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={disabled}
        aria-label={triggerAriaLabel}
        title={triggerTitle}
        className={triggerClassName}
      >
        {icon}
        {triggerLabel}
      </button>
    );
  }

  return (
    <div className={wrapperClassName}>
      {confirmPrompt && <p className={promptClassName}>{confirmPrompt}</p>}
      <div className={buttonRowClassName}>
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          className={confirmClassName}
        >
          {pending ? (pendingLabel ?? confirmLabel) : confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className={cancelClassName}
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
