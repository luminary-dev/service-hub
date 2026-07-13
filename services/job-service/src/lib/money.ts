// Money edge conversion (#371). JobRequest.budget is stored as DECIMAL(12,2)
// (whole LKR rupees) which the Prisma client surfaces as a Decimal instance —
// and a Decimal JSON-serializes as a *string*. Every API edge must convert
// back to a plain number explicitly so `budget` stays a number (or null) to
// JSON consumers (web, S2S peers). The conversion is exact for our values:
// 12 digits sit far below Number.MAX_SAFE_INTEGER. provider-service keeps an
// identical copy for Service.price — keep edits in lockstep.
import type { Prisma } from "@prisma/client";

export function moneyToNumber(value: Prisma.Decimal | number): number {
  return Number(value);
}

export function moneyToNumberOrNull(
  value: Prisma.Decimal | number | null | undefined
): number | null {
  return value == null ? null : Number(value);
}
