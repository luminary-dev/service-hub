import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/tokens";

const schema = z.object({ token: z.string().min(1) });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const record = await db.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
  });
  if (!record || record.expiresAt < new Date()) {
    if (record) {
      await db.emailVerificationToken.delete({ where: { id: record.id } });
    }
    return NextResponse.json({ error: "expired" }, { status: 400 });
  }

  await db.$transaction([
    db.user.update({
      where: { id: record.userId },
      data: { emailVerified: new Date() },
    }),
    db.emailVerificationToken.deleteMany({ where: { userId: record.userId } }),
  ]);

  return NextResponse.json({ ok: true });
}
