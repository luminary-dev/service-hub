// Renders a `<script type="application/ld+json">` tag for structured data
// (schema.org). Serialization escapes `<` so a value can never close the
// script element early (`</script>`) or open a comment/CDATA — the standard
// guard against JSON-LD injection when the payload contains user-supplied
// strings. Server-rendered; no client JS.
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
