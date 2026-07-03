import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { sendVerificationEmail } from "@/lib/verification";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.emailVerified) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  const locale = await getLocale();
  try {
    await sendVerificationEmail(
      user.id,
      user.email,
      req.nextUrl.origin,
      locale
    );
  } catch (e) {
    console.error("[resend-verification] failed", e);
    return NextResponse.json(
      { error: "Could not send verification email." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
