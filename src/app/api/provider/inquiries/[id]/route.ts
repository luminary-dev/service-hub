import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentProvider } from "@/lib/provider-auth";

const schema = z.object({
  status: z.enum(["NEW", "RESPONDED", "CLOSED"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const provider = await getCurrentProvider();
  if (!provider) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const inquiry = await db.inquiry.findUnique({ where: { id } });
  if (!inquiry || inquiry.providerId !== provider.id) {
    return NextResponse.json({ error: "Inquiry not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const updated = await db.inquiry.update({
    where: { id },
    data: { status: parsed.data.status },
  });

  return NextResponse.json({ inquiry: updated });
}
