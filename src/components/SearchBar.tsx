"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CATEGORIES } from "@/lib/constants";

export default function SearchBar() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (category) params.set("category", category);
    router.push(`/providers?${params.toString()}`);
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-2xl border border-ink-200 bg-white p-2 shadow-sm sm:flex-row"
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="What do you need? e.g. wiring, brake repair…"
        className="flex-1 rounded-xl px-4 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="rounded-xl border-0 bg-ink-50 px-3 py-2.5 text-sm text-ink-700 focus:outline-none"
      >
        <option value="">All categories</option>
        {CATEGORIES.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.label}
          </option>
        ))}
      </select>
      <button type="submit" className="btn-primary">
        Search
      </button>
    </form>
  );
}
