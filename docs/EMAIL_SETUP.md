# Email setup (password reset & verification)

> **Status: NOT LIVE for real users yet — blocked on a sending domain.**
> The password-reset and email-verification code is deployed and works, but
> **no emails are actually delivered in production** until the steps below are done.

## Why it's not working yet

Transactional email is sent via [Resend](https://resend.com). Two things are missing:

1. **`RESEND_API_KEY` is not set** in Vercel. Until it is, the app runs fine but
   only **logs the reset/verify link to the Vercel server console** instead of
   emailing it (see `src/lib/email.ts` — the no-key fallback). Customers get nothing.
2. **We do not own a verified sending domain yet.** Resend only lets you send from
   `onboarding@resend.dev` until a domain is verified, and that test sender
   **only delivers to your own Resend-account email address** — not to real
   customers. So a domain is required before launch.

There is **no way to enable real customer email delivery in Vercel without a
domain.** This is a hard dependency, noted here for later.

## What works right now, without a domain

- The full flow is testable locally (links print to the terminal).
- In production you can smoke-test delivery by setting only `RESEND_API_KEY` and
  sending a reset to **the email you signed up to Resend with** — that one address
  will receive it even without domain verification.

## TODO — enable production email (do this when the domain is ready)

- [ ] Register / confirm the sending domain (e.g. `baas.lk`).
- [ ] Create a free Resend account (3,000 emails/mo, 100/day on the free tier).
- [ ] In Resend: **add the domain and verify it** (add the DNS records Resend
      provides — SPF/DKIM, and DMARC recommended).
- [ ] In Resend: create an **API key**.
- [ ] In Vercel (Project → Settings → Environment Variables, or via CLI), set:
  - [ ] `RESEND_API_KEY` = the `re_...` key  *(Production, Preview)*
  - [ ] `EMAIL_FROM` = e.g. `Baas.lk <noreply@baas.lk>`  *(must be on the verified domain)*
- [ ] **Redeploy** — env-var changes only take effect on a new deployment.
- [ ] End-to-end test: request a password reset for a real address and confirm the
      email arrives; click the link and confirm the reset completes.
- [ ] Check the email renders correctly in Gmail + a Sri Lankan provider (e.g. an
      `@sltnet.lk` / common local inbox) and that it doesn't land in spam.

## Related

- Code: `src/lib/email.ts`, `src/lib/verification.ts`, `src/app/api/auth/*`
- Feature PR: #70
