-- #652: the map pin is a pair. `latitude`/`longitude` must be BOTH set or BOTH
-- null — a lone coordinate is meaningless and would produce a half-location the
-- search index (phase 2, PostGIS) can't turn into a point. The routes already
-- enforce this (geoPairState in lib/field-rules.ts), but a drifted S2S/backfill
-- write had no DB-level guard. `(a IS NULL) = (b IS NULL)` is true exactly when
-- both are null or both are non-null. CHECKs aren't modelled by Prisma — see the
-- matching comment in schema.prisma. Guarded/idempotent; on a fresh DB it
-- applies to an empty table and always succeeds.

ALTER TABLE "Provider" DROP CONSTRAINT IF EXISTS "Provider_geo_pair_check";
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_geo_pair_check"
    CHECK (("latitude" IS NULL) = ("longitude" IS NULL));
