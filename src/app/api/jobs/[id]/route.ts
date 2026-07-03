import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

const schema = z.object({ status: z.enum(["OPEN", "CLOSED"]) });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const job = await db.jobRequest.findUnique({ where: { id } });
  if (!job || job.customerId !== session.userId) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  await db.jobRequest.update({
    where: { id },
    data: { status: parsed.data.status },
  });
  return NextResponse.json({ ok: true });
}
