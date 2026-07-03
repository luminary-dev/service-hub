import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { jobSchema } from "@/lib/job-schema";

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, "job-post", RATE_LIMITS.inquiry);
  if (limited) return limited;

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in to post a job" },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = jobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const job = await db.jobRequest.create({
    data: {
      customerId: session.userId,
      category: parsed.data.category,
      district: parsed.data.district,
      title: parsed.data.title,
      description: parsed.data.description,
      budget: parsed.data.budget ?? null,
    },
  });

  return NextResponse.json({ id: job.id });
}
