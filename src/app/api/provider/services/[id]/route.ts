import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentProvider } from "@/lib/provider-auth";

const schema = z.object({
  title: z.string().min(2).max(100),
  description: z.string().max(500).optional().or(z.literal("")),
  price: z.number().positive(),
  priceType: z.enum(["HOURLY", "DAILY", "FIXED", "VISIT"]),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const provider = await getCurrentProvider();
  if (!provider) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const service = await db.service.findUnique({ where: { id } });
  if (!service || service.providerId !== provider.id) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const updated = await db.service.update({
    where: { id },
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      price: parsed.data.price,
      priceType: parsed.data.priceType,
    },
  });

  return NextResponse.json({ service: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const provider = await getCurrentProvider();
  if (!provider) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const service = await db.service.findUnique({ where: { id } });
  if (!service || service.providerId !== provider.id) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  await db.service.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
