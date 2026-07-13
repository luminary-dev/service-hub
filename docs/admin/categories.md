# Categories


Route: **`/admin/categories`** (`src/app/admin/categories/page.tsx`,
`AdminCategoryManager.tsx`). Edits gated by `hasFullAdminAccess` — SUPPORT sees
the list read-only.

Lists every managed category (including inactive) via
`GET /api/admin/categories`. Header stats: total / active / inactive. Each
category has a `slug`, English label (`labelEn`), Sinhala label (`labelSi`),
`icon`, an optional cover image (`imageUrl`), `active` flag, and `sortOrder`.

- **Add** — slug (pattern `^[a-z0-9-]{2,40}$`), icon, EN/SI labels, sort order →
  `POST /api/admin/categories` (409 on duplicate slug).
- **Edit** — inline edit of EN/SI labels, icon, sort order →
  `PATCH /api/admin/categories/{slug}`.
- **Icon** — a **dropdown picker** of a curated set of trade icons (the
  `Fa…` names in `src/lib/constants.ts` → `CATEGORY_ICONS`) with a live preview,
  **not** a free-text field. Optional: leaving it on "Default" derives the icon
  from the slug (`categoryIcon()`), falling back to a generic tools icon for a
  slug the static map doesn't know. When set, the UI resolves it by name
  (`iconByName`) and honors it wherever a category record is rendered
  (`CategoryIcon`).
- **Cover image (#436)** — upload a per-category cover via
  `POST /api/admin/categories/image` (full-admin only; multipart → media-service
  `category` namespace, R2 in prod; jpeg/png/webp ≤5MB). It becomes the card
  cover fallback when a provider has no cover of their own. Distinct from `icon`
  (a font-awesome component name, not an image). The saved `imageUrl` must be a
  relative path under one of our own media roots (`/api/files/…` upload or a
  seeded `/images/…` asset) — external and protocol-relative (`//host/…`) URLs
  are rejected (#519).
- **Active flag** — Activate / Deactivate toggles the `active` flag via
  `PATCH /api/admin/categories/{slug}`. There is **no hard delete by design**:
  deactivating hides a category from public lists while existing providers keep
  the slug.

Public surfaces follow the managed list: the browse filters, job forms, the
provider wizard, the homepage ticker/trade grid, and the sitemap's
`?category=` entries all read the active categories via
`fetchCategoryOptions()` (#561), so an added category appears — and a
deactivated one disappears — everywhere within the cache TTL (≤5 min pages,
≤1 h sitemap). The static `CATEGORIES` constant remains only as the
degradation fallback when provider-service is unreachable.

---

