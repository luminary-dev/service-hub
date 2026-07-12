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
- **Cover image (#436)** — upload a per-category cover via
  `POST /api/admin/categories/image` (full-admin only; multipart → media-service
  `category` namespace, R2 in prod; jpeg/png/webp ≤5MB). It becomes the card
  cover fallback when a provider has no cover of their own. Distinct from `icon`
  (a font-awesome component name, not an image).
- **Active flag** — Activate / Deactivate toggles the `active` flag via
  `PATCH /api/admin/categories/{slug}`. There is **no hard delete by design**:
  deactivating hides a category from public lists while existing providers keep
  the slug.

---

