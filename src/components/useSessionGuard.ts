"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useToast } from "./ToastProvider";
import { useT } from "./I18nProvider";
import {
  localizedHref,
  loginNextHref,
  pathLocale,
  sanitizeNext,
} from "@/lib/links";

// Centralized 401 handling for client mutations (#774).
//
// A JWT that lapses mid-browse makes an authenticated mutation (save a
// favourite, send a message, submit an inquiry) fail with a 401 the user can
// only fix by re-signing-in — but the server-rendered navbar still shows them
// as signed in, so a generic "could not save" toast just invites futile
// retries. Every such surface previously handled this differently (only
// ChatAssistant special-cased 401).
//
// This hook returns a guard: pass it the fetch Response (or null on a network
// error). If it's a 401 it shows a localized "session expired — sign in" toast,
// routes to /login?next=<current path> (sanitised, locale-preserved) and calls
// router.refresh() to resync the navbar, then returns true so the caller can
// bail out of its own error branch. Otherwise it returns false and the caller
// handles the response as usual.
export function useSessionGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const t = useT();

  return useCallback(
    (res: Response | null | undefined): boolean => {
      if (!res || res.status !== 401) return false;
      const locale = pathLocale(pathname);
      // pathname is already locale-prefixed; sanitizeNext guarantees a safe
      // same-origin relative path before it feeds the ?next= round-trip.
      const next = sanitizeNext(pathname) ?? localizedHref("/", locale);
      toast.error(t.toast.sessionExpired);
      router.push(localizedHref(loginNextHref(next), locale));
      router.refresh();
      return true;
    },
    [router, pathname, toast, t]
  );
}
