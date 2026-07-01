import Link from "next/link";

export const metadata = { title: "Join ServiceHub" };

export default function RegisterChoicePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-center text-3xl font-bold tracking-tight text-ink-900">
        Join ServiceHub
      </h1>
      <p className="mt-2 text-center text-ink-500">
        How would you like to use ServiceHub?
      </p>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <Link
          href="/register/customer"
          className="card group p-8 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg hover:shadow-ink-200/60"
        >
          <span className="text-4xl">🏡</span>
          <h2 className="mt-4 text-xl font-semibold text-ink-900 group-hover:text-brand-700">
            I need a service
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">
            Create a free customer account to send inquiries and leave reviews.
            You can also browse without an account.
          </p>
          <span className="mt-4 inline-block text-sm font-semibold text-brand-600">
            Sign up as a customer →
          </span>
        </Link>

        <Link
          href="/register/provider"
          className="card group p-8 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg hover:shadow-ink-200/60"
        >
          <span className="text-4xl">🛠️</span>
          <h2 className="mt-4 text-xl font-semibold text-ink-900 group-hover:text-brand-700">
            I offer services
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">
            Build your professional profile with photos, rates and contact
            details. Get discovered by customers across Sri Lanka.
          </p>
          <span className="mt-4 inline-block text-sm font-semibold text-brand-600">
            Join as a professional →
          </span>
        </Link>
      </div>

      <p className="mt-8 text-center text-sm text-ink-500">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-semibold text-brand-600 hover:text-brand-700"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
