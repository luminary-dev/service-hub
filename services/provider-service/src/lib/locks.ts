// Transaction-scoped advisory locking for check-then-act caps (#647 L5).
//
// A per-user "SELECT count(...) → INSERT" cap (or a "SELECT dup → INSERT"
// uniqueness check) is racy on its own: a concurrent double-submit lets two
// requests both read a count below the limit before either commits, so both
// insert and the cap is overshot. A plain transaction does NOT fix this —
// under READ COMMITTED (Postgres' default) neither transaction sees the
// other's uncommitted rows, so both still pass the check.
//
// `advisoryXactLock` takes a transaction-scoped Postgres advisory lock as the
// FIRST statement inside an interactive `db.$transaction(...)`. The lock is
// held until the transaction commits or rolls back (no explicit unlock), so
// concurrent submits for the same (namespace, key) serialize — the second
// blocks until the first has committed and its rows are visible to the
// re-count. The lock is keyed by a per-feature `namespace` plus the caller's
// id, so unrelated features (which may share one database) and unrelated users
// never contend. `hashtext` maps each string to the int4 pair the two-key
// `pg_advisory_xact_lock(int, int)` overload takes.
import { Prisma } from "@prisma/client";

export function advisoryXactLock(
  tx: Prisma.TransactionClient,
  namespace: string,
  key: string
): Promise<number> {
  return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${namespace}), hashtext(${key}))`;
}
