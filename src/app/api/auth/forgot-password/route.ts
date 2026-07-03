import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createToken, RESET_TOKEN_TTL_MS } from "@/lib/tokens";
import { sendMail, passwordResetEmail } from "@/lib/email";
import { getLocale } from "@/lib/locale";

const schema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  // Always return the same response regardless of whether the email exists,
  // so this endpoint cannot be used to enumerate registered accounts.
  if (!parsed.success) return NextResponse.json({ ok: true });

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (user) {
    await db.passwordResetToken.deleteMany({ where: { userId: user.id } });
    const { raw, hash } = createToken();
    await db.passwordResetToken.create({
      data: {
        tokenHash: hash,
        userId: user.id,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });
    const url = `${req.nextUrl.origin}/reset-password?token=${raw}`;
    const locale = await getLocale();
    const { subject, html } = passwordResetEmail(url, locale);
    try {
      await sendMail({ to: user.email, subject, html });
    } catch (e) {
      console.error("[forgot-password] email send failed", e);
    }
  }

  return NextResponse.json({ ok: true });
}
