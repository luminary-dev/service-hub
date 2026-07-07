// Registration validation, ported verbatim from the monolith's
// src/app/api/auth/register/route.ts. Kept in its own module so the schema
// can be unit-tested without pulling in the DB client.
import { z } from "zod";
import { isCommonPassword } from "./common-passwords";
import {
  districtEnum,
  optionalSlPhone,
  optionalWebUrl,
  priceRupees,
  slPhone,
} from "./field-rules";

export const serviceSchema = z.object({
  title: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  price: priceRupees,
  priceType: z.enum(["HOURLY", "DAILY", "FIXED", "VISIT"]),
});

// Single source of truth for password rules — reused by change-password and
// reset-password. Minimum length 10 (length is the strongest single factor)
// plus an offline breach/common-password screen. Length is validated before the
// deny-list so the user gets the more actionable message first.
export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(100)
  .refine((p) => !isCommonPassword(p), {
    message: "This password is too common — please choose a less guessable one",
  });

const baseSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: passwordSchema,
  phone: slPhone,
});

export const customerSchema = baseSchema.extend({
  role: z.literal("CUSTOMER"),
});

export const providerSchema = baseSchema.extend({
  role: z.literal("PROVIDER"),
  // Category membership is checked against provider-service's Category table
  // after parsing (routes/auth.ts) — zod schemas are sync, and the list is
  // now data, not code.
  category: z.string().min(1).max(40),
  headline: z.string().min(5).max(120),
  bio: z.string().min(20).max(2000),
  district: districtEnum,
  city: z.string().min(1).max(60),
  experience: z.number().int().min(0).max(60),
  whatsapp: optionalSlPhone,
  phone2: optionalSlPhone,
  facebook: optionalWebUrl,
  instagram: optionalWebUrl,
  tiktok: optionalWebUrl,
  youtube: optionalWebUrl,
  website: optionalWebUrl,
  services: z.array(serviceSchema).min(1).max(20),
});

export const registerSchema = z.discriminatedUnion("role", [
  customerSchema,
  providerSchema,
]);

export type RegisterInput = z.infer<typeof registerSchema>;
