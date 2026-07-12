# Favorites


Signed-in customers can save providers. `FavoriteButton` (overlay on cards,
inline pill on profiles) toggles optimistically and calls
`POST /api/favorites/{providerId}` (add) or `DELETE /api/favorites/{providerId}`
(remove). Favorites are backed by identity-service. The `/account` saved list
fetches `GET /api/favorites`, hydrates the provider cards
(`GET /api/providers?ids=...`) preserving newest-first order, and excludes
suspended profiles.

---

