// Average time a provider takes to respond to inquiries, from the
// createdAt -> respondedAt gap of answered inquiries. Pure so it can be
// unit-tested without a database.
export function averageResponseMs(
  rows: { createdAt: Date; respondedAt: Date | null }[]
): number | null {
  let total = 0;
  let count = 0;
  for (const row of rows) {
    if (!row.respondedAt) continue;
    const gap = row.respondedAt.getTime() - row.createdAt.getTime();
    // Clock skew or bad data could make the gap negative; skip rather than
    // drag the average below zero.
    if (gap < 0) continue;
    total += gap;
    count += 1;
  }
  return count === 0 ? null : Math.round(total / count);
}
