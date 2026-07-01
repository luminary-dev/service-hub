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

export async function POST(req: NextRequest) {
  const provider = await getCurrentProvider();
  if (!provider) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const service = await db.service.create({
    data: {
      providerId: provider.id,
      title: parsed.data.title,
      description: parsed.data.description || null,
      price: parsed.data.price,
      priceType: parsed.data.priceType,
    },
  });

  return NextResponse.json({ service });
}
