// Registration validation, ported verbatim from the monolith's
// src/app/api/auth/register/route.ts. Kept in its own module so the schema
// can be unit-tested without pulling in the DB client.
import { z } from "zod";

export const serviceSchema = z.object({
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

export const customerSchema = baseSchema.extend({
  role: z.literal("CUSTOMER"),
});

export const providerSchema = baseSchema.extend({
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

export const registerSchema = z.discriminatedUnion("role", [
  customerSchema,
  providerSchema,
]);

export type RegisterInput = z.infer<typeof registerSchema>;
