# Favorites


Signed-in customers can save providers. `FavoriteButton` (overlay on cards,
inline pill on profiles) toggles optimistically and calls
`POST /api/favorites/{providerId}` (add) or `DELETE /api/favorites/{providerId}`
(remove). Favorites are backed by identity-service. The `/account` saved list
fetches `GET /api/favorites`, hydrates the provider cards
(`GET /api/providers?ids=...`) preserving newest-first order, and excludes
suspended profiles.

A customer can favorite up to **100** providers (#647); re-favoriting a
provider already on the list is a no-op that never burns a slot, and a new
favorite past the cap returns `429 { error: "Favorites limit reached" }`.

To save a *search* (and get emailed about future matches) rather than a
specific provider, see [Saved searches & alerts](saved-searches.md) (#516).

---

