// Social login (#398). A plain anchor — starting the OAuth flow is a top-level
// GET navigation to the gateway (proxied to identity-service), not a fetch, so
// this works in both server and client pages. `next` (optional) is a
// same-origin relative path to return to after sign-in.
export default function FacebookSignInButton({
  label,
  next,
}: {
  label: string;
  next?: string;
}) {
  const href = next
    ? `/api/auth/oauth/facebook/start?next=${encodeURIComponent(next)}`
    : "/api/auth/oauth/facebook/start";
  return (
    <a
      href={href}
      className="flex w-full items-center justify-center gap-3 rounded-md border border-ink-300 bg-surface px-4 py-2.5 text-sm font-semibold text-ink-800 transition-colors hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#1877F2"
          d="M24 12c0-6.627-5.373-12-12-12S0 5.373 0 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078V12h3.047V9.356c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874V12h3.328l-.532 3.469h-2.796v8.385C19.612 22.954 24 17.99 24 12Z"
        />
      </svg>
      {label}
    </a>
  );
}
