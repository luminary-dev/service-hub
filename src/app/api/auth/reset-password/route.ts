import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/tokens";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(6).max(100),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 }
    );
  }

  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
  });
  if (!record || record.expiresAt < new Date()) {
    if (record) {
      await db.passwordResetToken.delete({ where: { id: record.id } });
    }
    return NextResponse.json(
      { error: "This reset link is invalid or has expired." },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await db.$transaction([
    db.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    // Single-use: consume every reset token for this user.
    db.passwordResetToken.deleteMany({ where: { userId: record.userId } }),
  ]);

  return NextResponse.json({ ok: true });
}
