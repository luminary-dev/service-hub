import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

const schema = z.object({
  action: z.enum(["verify", "unverify", "suspend", "unsuspend"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const provider = await db.provider.findUnique({ where: { id } });
  if (!provider) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  switch (parsed.data.action) {
    case "verify":
      data.verificationStatus = "VERIFIED";
      data.verifiedAt = new Date();
      break;
    case "unverify":
      data.verificationStatus = "NONE";
      data.verifiedAt = null;
      break;
    case "suspend":
      data.suspended = true;
      break;
    case "unsuspend":
      data.suspended = false;
      break;
  }

  await db.provider.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}
