// Minimal CSV serializer for admin data exports (#230). No external
// dependency — the escaping rules we need are simple: quote a cell if it
// contains a comma, double quote, or newline, and double up any embedded
// quotes (RFC 4180). Rows are plain flat objects; the header row is taken
// from the keys of the first row, in insertion order.
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";

  const headers = Object.keys(rows[0]);

  const escapeCell = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const str = typeof value === "string" ? value : String(value);
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const lines = [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => headers.map((h) => escapeCell(row[h])).join(",")),
  ];

  // CRLF line endings per RFC 4180 — also what Excel expects.
  return lines.join("\r\n");
}
