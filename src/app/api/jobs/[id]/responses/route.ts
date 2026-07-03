import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getCurrentProvider } from "@/lib/provider-auth";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { jobResponseSchema } from "@/lib/job-schema";
import { sendMail, jobResponseEmail } from "@/lib/email";
import { getLocale } from "@/lib/locale";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = rateLimit(req, "job-response", RATE_LIMITS.review);
  if (limited) return limited;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to respond" }, { status: 401 });
  }
  const provider = await getCurrentProvider();
  if (!provider) {
    return NextResponse.json(
      { error: "Only registered professionals can respond to jobs" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const job = await db.jobRequest.findUnique({
    where: { id },
    include: { customer: { select: { email: true } } },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status !== "OPEN") {
    return NextResponse.json(
      { error: "This job is closed" },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = jobResponseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const existing = await db.jobResponse.findUnique({
    where: {
      jobRequestId_providerId: { jobRequestId: id, providerId: provider.id },
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: "You've already responded to this job" },
      { status: 400 }
    );
  }

  await db.jobResponse.create({
    data: {
      jobRequestId: id,
      providerId: provider.id,
      message: parsed.data.message,
    },
  });

  // Best-effort notification to the customer — never fail the response on this.
  try {
    const locale = await getLocale();
    const { subject, html } = jobResponseEmail(
      `${req.nextUrl.origin}/jobs`,
      session.name,
      job.title,
      locale
    );
    await sendMail({ to: job.customer.email, subject, html });
  } catch (e) {
    console.error("[job-response] notification failed", e);
  }

  return NextResponse.json({ ok: true });
}
