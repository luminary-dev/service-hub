"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FaCircleCheck, FaCircleExclamation, FaXmark } from "@/components/icons";
import { useT } from "./I18nProvider";

export const TOAST_DURATION_MS = 4000;

type ToastVariant = "success" | "error";

type Toast = { id: number; message: string; variant: ToastVariant };

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  // One auto-dismiss timer per toast so hover/focus can pause it and unmount
  // can clear them all (#565).
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const t = useT();

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((ts) => ts.filter((toast) => toast.id !== id));
  }, []);

  // Pause auto-dismiss while the pointer or keyboard focus is on the toast —
  // 4s is short for longer Sinhala strings and for magnification users.
  const pauseDismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const scheduleDismiss = useCallback(
    (id: number) => {
      pauseDismiss(id);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), TOAST_DURATION_MS)
      );
    },
    [dismiss, pauseDismiss]
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  const push = useCallback(
    (message: string, variant: ToastVariant) => {
      const id = ++nextId.current;
      setToasts((ts) => [...ts, { id, message, variant }]);
      scheduleDismiss(id);
    },
    [scheduleDismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push(message, "success"),
      error: (message) => push(message, "error"),
    }),
    [push]
  );

  const renderToast = (toast: Toast) => {
    const isError = toast.variant === "error";
    return (
      <div
        key={toast.id}
        // Errors interrupt (assertive) so failure feedback isn't missed;
        // success/info wait their turn (polite).
        role={isError ? "alert" : "status"}
        onMouseEnter={() => pauseDismiss(toast.id)}
        onMouseLeave={() => scheduleDismiss(toast.id)}
        onFocus={() => pauseDismiss(toast.id)}
        onBlur={(e) => {
          // Resume only when focus leaves the toast entirely (e.g. moving
          // from the message to the dismiss button keeps it paused).
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            scheduleDismiss(toast.id);
          }
        }}
        className="rise pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full bg-ink-900 py-2.5 pl-4 pr-2.5 text-sm font-medium text-white shadow-lg dark:text-ink-50"
      >
        {isError ? (
          <FaCircleExclamation className="h-4 w-4 shrink-0 text-red-400" />
        ) : (
          <FaCircleCheck className="h-4 w-4 shrink-0 text-emerald-400" />
        )}
        <span className="min-w-0">{toast.message}</span>
        <button
          type="button"
          onClick={() => dismiss(toast.id)}
          aria-label={t.toast.dismiss}
          className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white dark:text-ink-50/60 dark:hover:bg-ink-50/10 dark:hover:text-ink-50"
        >
          <FaXmark className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/*
        Two live regions so errors interrupt screen-reader output while
        success/info announcements queue politely. Nesting variants under a
        single region would let error toasts wait behind earlier ones.
      */}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2 px-4">
        <div aria-live="assertive" className="flex flex-col items-center gap-2">
          {toasts.filter((toast) => toast.variant === "error").map(renderToast)}
        </div>
        <div aria-live="polite" className="flex flex-col items-center gap-2">
          {toasts.filter((toast) => toast.variant !== "error").map(renderToast)}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
