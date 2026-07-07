"use client";

import { toCsv } from "@/lib/csv";

// Client-side CSV export (#230): receives the already-fetched, already
// rendered rows as a flat-object prop, serializes them on click and
// triggers a browser download via a Blob + temporary anchor element. No
// network round-trip — whatever the server component rendered is what
// gets exported.
export default function ExportCsvButton({
  rows,
  filename,
  label,
}: {
  rows: Record<string, unknown>[];
  filename: string;
  label: string;
}) {
  function handleExport() {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={rows.length === 0}
      className="btn-secondary"
    >
      {label}
    </button>
  );
}
