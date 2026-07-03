import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { sendVerificationEmail } from "@/lib/verification";

const serviceSchema = z.object({
  title: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  price: z.number().positive(),
  priceType: z.enum(["HOURLY", "DAILY", "FIXED", "VISIT"]),
});

const baseSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(6).max(100),
  phone: z.string().min(9).max(15),
});

const customerSchema = baseSchema.extend({
  role: z.literal("CUSTOMER"),
});

const providerSchema = baseSchema.extend({
  role: z.literal("PROVIDER"),
  category: z.string().min(1),
  headline: z.string().min(5).max(120),
  bio: z.string().min(20).max(2000),
  district: z.string().min(1),
  city: z.string().min(1).max(60),
  experience: z.number().int().min(0).max(60),
  whatsapp: z.string().max(15).optional().or(z.literal("")),
  phone2: z.string().max(15).optional().or(z.literal("")),
  facebook: z.string().max(200).optional().or(z.literal("")),
  instagram: z.string().max(200).optional().or(z.literal("")),
  tiktok: z.string().max(200).optional().or(z.literal("")),
  youtube: z.string().max(200).optional().or(z.literal("")),
  website: z.string().max(200).optional().or(z.literal("")),
  services: z.array(serviceSchema).min(1).max(20),
});

const schema = z.discriminatedUnion("role", [customerSchema, providerSchema]);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const data = parsed.data;

  const existing = await db.user.findUnique({ where: { email: data.email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  const user = await db.user.create({
    data: {
      email: data.email,
      passwordHash,
      name: data.name,
      phone: data.phone,
      role: data.role,
      ...(data.role === "PROVIDER"
        ? {
            provider: {
              create: {
                category: data.category,
                headline: data.headline,
                bio: data.bio,
                district: data.district,
                city: data.city,
                experience: data.experience,
                whatsapp: data.whatsapp || null,
                phone2: data.phone2 || null,
                facebook: data.facebook || null,
                instagram: data.instagram || null,
                tiktok: data.tiktok || null,
                youtube: data.youtube || null,
                website: data.website || null,
                services: { create: data.services },
              },
            },
          }
        : {}),
    },
    include: { provider: true },
  });

  await createSession({ userId: user.id, role: user.role, name: user.name });

  // Best-effort: a failure here must not fail registration.
  try {
    const locale = await getLocale();
    await sendVerificationEmail(user.id, user.email, req.nextUrl.origin, locale);
  } catch (e) {
    console.error("[register] verification email failed", e);
  }

  return NextResponse.json({
    user: { id: user.id, name: user.name, role: user.role },
    providerId: user.provider?.id ?? null,
  });
}
