import type { LegalDoc } from "@/lib/legal";

// Shared renderer for the /terms and /privacy documents (#62).
export default function LegalArticle({
  doc,
  tag,
}: {
  doc: LegalDoc;
  tag: string;
}) {
  return (
    <div className="blueprint-grid">
      <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
          <span className="rounded-sm bg-brand-700 px-1.5 py-0.5 text-white dark:text-ink-50">
            LEGAL
          </span>
          <span className="text-ink-500">{tag}</span>
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
          {doc.title}
        </h1>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-500">
          {doc.updated}
        </p>
        <p className="mt-6 leading-relaxed text-ink-700">{doc.intro}</p>

        {doc.sections.map((section) => (
          <section key={section.heading} className="mt-10">
            <h2 className="text-xl font-semibold tracking-tight text-ink-900">
              {section.heading}
            </h2>
            {section.body.map((paragraph, i) => (
              <p key={i} className="mt-3 leading-relaxed text-ink-700">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </article>
    </div>
  );
}
