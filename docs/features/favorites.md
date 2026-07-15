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

When a provider is erased, other users' favorites pointing at it are cleaned up
by the account-erasure orchestration (`db.favorite.deleteMany({ where: { providerId } })`,
#767) — identity already knows the `providerId` at erase time. Without this the
dead rows would linger forever: they show as fewer cards than the count (the
account page drops them after the `?ids=` hydration filter) and silently burn
cap slots the user can neither see nor remove.

To save a *search* (and get emailed about future matches) rather than a
specific provider, see [Saved searches & alerts](saved-searches.md) (#516).

---

