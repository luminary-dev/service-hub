// Money edge conversion (#371). Service.price is stored as DECIMAL(12,2)
// (whole LKR rupees) which the Prisma client surfaces as a Decimal instance —
// and a Decimal JSON-serializes as a *string*. Every API edge must convert
// back to a plain number explicitly so `price`/`fromPrice` stay numbers to
// JSON consumers (web, S2S peers). The conversion is exact for our values:
// 12 digits sit far below Number.MAX_SAFE_INTEGER. job-service keeps an
// identical copy for JobRequest.budget — keep edits in lockstep.
import type { Prisma } from "@prisma/client";

export function moneyToNumber(value: Prisma.Decimal | number): number {
  return Number(value);
}

export function moneyToNumberOrNull(
  value: Prisma.Decimal | number | null | undefined
): number | null {
  return value == null ? null : Number(value);
}
