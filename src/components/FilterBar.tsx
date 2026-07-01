"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CATEGORIES, DISTRICTS } from "@/lib/constants";

export default function FilterBar({
  q: initialQ,
  category: initialCategory,
  district: initialDistrict,
}: {
  q: string;
  category: string;
  district: string;
}) {
  const [q, setQ] = useState(initialQ);
  const [category, setCategory] = useState(initialCategory);
  const [district, setDistrict] = useState(initialDistrict);
  const router = useRouter();

  function apply(next: { q?: string; category?: string; district?: string }) {
    const params = new URLSearchParams();
    const nq = next.q ?? q;
    const nc = next.category ?? category;
    const nd = next.district ?? district;
    if (nq.trim()) params.set("q", nq.trim());
    if (nc) params.set("category", nc);
    if (nd) params.set("district", nd);
    router.push(`/providers?${params.toString()}`);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        apply({});
      }}
      className="card flex flex-col gap-2 p-3 sm:flex-row sm:items-center"
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, skill or city…"
        className="input sm:flex-1"
      />
      <select
        value={category}
        onChange={(e) => {
          setCategory(e.target.value);
          apply({ category: e.target.value });
        }}
        className="input sm:w-48"
      >
        <option value="">All categories</option>
        {CATEGORIES.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.label}
          </option>
        ))}
      </select>
      <select
        value={district}
        onChange={(e) => {
          setDistrict(e.target.value);
          apply({ district: e.target.value });
        }}
        className="input sm:w-44"
      >
        <option value="">All districts</option>
        {DISTRICTS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <button type="submit" className="btn-primary">
        Search
      </button>
    </form>
  );
}
