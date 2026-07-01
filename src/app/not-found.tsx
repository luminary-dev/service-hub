import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <span className="text-6xl">🧭</span>
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-ink-900">
        Page not found
      </h1>
      <p className="mt-2 text-ink-500">
        The page you&apos;re looking for doesn&apos;t exist or may have been
        removed.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/" className="btn-primary">
          Go home
        </Link>
        <Link href="/providers" className="btn-secondary">
          Browse professionals
        </Link>
      </div>
    </div>
  );
}
