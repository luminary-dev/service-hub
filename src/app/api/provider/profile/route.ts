import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentProvider } from "@/lib/provider-auth";

const schema = z.object({
  name: z.string().min(2).max(80),
  phone: z.string().min(9).max(15),
  category: z.string().min(1),
  headline: z.string().min(5).max(120),
  bio: z.string().min(20).max(2000),
  district: z.string().min(1),
  city: z.string().min(1).max(60),
  experience: z.number().int().min(0).max(60),
  available: z.boolean(),
  whatsapp: z.string().max(15).optional().or(z.literal("")),
  phone2: z.string().max(15).optional().or(z.literal("")),
  facebook: z.string().max(200).optional().or(z.literal("")),
  instagram: z.string().max(200).optional().or(z.literal("")),
  tiktok: z.string().max(200).optional().or(z.literal("")),
  youtube: z.string().max(200).optional().or(z.literal("")),
  website: z.string().max(200).optional().or(z.literal("")),
});

export async function PUT(req: NextRequest) {
  const provider = await getCurrentProvider();
  if (!provider) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { name, phone, ...profile } = parsed.data;

  const updated = await db.provider.update({
    where: { id: provider.id },
    data: {
      ...profile,
      whatsapp: profile.whatsapp || null,
      phone2: profile.phone2 || null,
      facebook: profile.facebook || null,
      instagram: profile.instagram || null,
      tiktok: profile.tiktok || null,
      youtube: profile.youtube || null,
      website: profile.website || null,
      user: { update: { name, phone } },
    },
  });

  return NextResponse.json({ provider: updated });
}
