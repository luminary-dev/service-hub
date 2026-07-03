# Baas.lk

A service marketplace for Sri Lanka connecting customers with local professionals — mechanics, electricians, plumbers, garden designers and more. "Baas" (බාස්) is the Sinhala word for a skilled tradesman. Professionals build a public profile with work photos, social links, contact numbers and rates; customers browse, filter by district/category, send inquiries and leave reviews. No payments happen on the platform — customers deal with professionals directly.

The customer-facing UI is bilingual — an EN/සිං toggle in the navbar switches between English and Sinhala (cookie-based, translations in `src/lib/i18n.ts`).

## Stack

- **Frontend** — Next.js 16 (App Router) + React 19 + Tailwind CSS 4
- **Backend** — Next.js API route handlers (REST, JSON) — a modular monolith; the API layer is cleanly separated so it can be split into services later if needed
- **Database** — SQLite via Prisma ORM (swap `datasource` to PostgreSQL for production)
- **Auth** — JWT sessions in httpOnly cookies (`jose` + `bcryptjs`), validation with `zod`

## Getting started

```bash
npm install
npm run db:setup   # generate client, create SQLite DB, seed sample data
npm run dev
```

Open http://localhost:3000.

### Seeded accounts (password: `password123`)

| Role | Email | Notes |
| --- | --- | --- |
| Provider | `nuwan@example.com` | Mechanic, Colombo — has reviews + an inquiry |
| Provider | `kumari@example.com` | Garden designer, Kandy |
| Customer | `dilani@example.com` | Can leave reviews |

## Features

**Customers** (account optional)
- Browse/search professionals by keyword, category and district, with pagination
- View profiles: bio, services & rates (LKR), work-photo gallery with lightbox, social links, reviews
- Send inquiries without an account; call/WhatsApp directly
- With a free account: leave and edit star-rated reviews

**Professionals** (account required — details collected at registration)
- 4-step registration: account → profile → contact & socials → services & rates
- Dashboard: stats (rating, reviews, photos, new inquiries), edit profile & availability,
  manage services, upload/delete work photos & profile picture, manage inquiries (new/responded/closed)

## API overview

| Method | Route | Auth |
| --- | --- | --- |
| POST | `/api/auth/register` `/login` `/logout` | — |
| GET | `/api/auth/me` | session |
| GET | `/api/providers`, `/api/providers/:id` | — |
| POST | `/api/providers/:id/inquiries` | — |
| POST | `/api/providers/:id/reviews` | customer/provider session |
| PUT | `/api/provider/profile` | provider |
| POST/PUT/DELETE | `/api/provider/services(/:id)` | provider |
| POST/DELETE | `/api/provider/photos(/:id)` | provider (multipart upload, 5MB max) |
| GET/PATCH | `/api/provider/inquiries(/:id)` | provider |

## Project layout

```
prisma/            schema + seed script
src/lib/           db client, auth/session, constants (categories, districts)
src/app/api/       backend route handlers
src/app/           pages (home, providers, profile, auth, dashboard)
src/components/    UI components (cards, gallery, forms, dashboard tabs)
public/uploads/    user-uploaded images (gitignored)
```

## Production notes

- Set a strong `AUTH_SECRET` in `.env`
- Move `DATABASE_URL` to PostgreSQL and re-run `prisma db push`
- Uploads write to `public/uploads/`; use object storage (S3 etc.) behind a CDN when deploying serverless
- **Email (password reset & verification) is NOT delivering to real users yet** — it needs a verified sending domain + `RESEND_API_KEY`. See [docs/EMAIL_SETUP.md](docs/EMAIL_SETUP.md).
