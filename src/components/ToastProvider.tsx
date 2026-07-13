"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { FaCircleCheck, FaCircleExclamation, FaXmark } from "@/components/icons";
import { useT } from "./I18nProvider";

const TOAST_DURATION_MS = 4000;

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
  const t = useT();

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message: string, variant: ToastVariant) => {
      const id = ++nextId.current;
      setToasts((ts) => [...ts, { id, message, variant }]);
      setTimeout(() => dismiss(id), TOAST_DURATION_MS);
    },
    [dismiss]
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
