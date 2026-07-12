# Impersonation ("view as")


Route: **`/admin/impersonate`** (`src/app/admin/impersonate/page.tsx`,
`ImpersonateForm.tsx`). **ADMIN-only** (the page redirects non-`ADMIN`;
identity-service gates the impersonation endpoints on `isFullAdmin`). A stopgap
standalone page (#234), intended to later become a "View as" button on the user
detail page.

Enter a user id or email and submit; the app calls
`POST /api/admin/impersonate/{identifier}` (identity-service,
`admin-impersonation.ts`) and, on success, drops you into that user's session
so you can reproduce what they see for support debugging.

- **Short-lived and isolated.** Impersonation issues a 15-minute
  (`expiresInSeconds: 900`) token in a separate `impersonation_session` cookie —
  it never touches the admin's own `sh_session`. The gateway prefers the
  impersonation identity when present.
- **Guardrails.** You cannot impersonate yourself, and you cannot impersonate
  **any ADMIN account** (defense in depth).
- **Logged.** Each start writes an `ImpersonationLog` row (admin id, target user
  id, started-at) and a structured log line; ending
  (`POST /api/admin/impersonate/end`) clears the cookie, closes the log row
  (`endedAt`), and logs the event.

---

