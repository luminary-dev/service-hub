-- Case-insensitive email (#431): all new writes are lower-cased at the schema
-- layer; bring existing rows into line so lookups by the normalized address
-- match. Touches only rows that differ, and is a no-op on a clean DB.
-- (If two rows collided only by case this would violate the unique index and
-- fail loudly — intentional; there are none pre-launch.)
UPDATE "User" SET "email" = lower("email") WHERE "email" <> lower("email");
