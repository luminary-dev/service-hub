import { z } from "zod";
import { CATEGORIES, DISTRICTS } from "./constants";

const categorySlugs = [...CATEGORIES] as [string, ...string[]];
const districtNames = [...DISTRICTS] as [string, ...string[]];

export const jobSchema = z.object({
  category: z.enum(categorySlugs),
  district: z.enum(districtNames),
  title: z.string().min(5).max(100),
  description: z.string().min(10).max(2000),
  budget: z.number().int().min(100).max(100_000_000).nullable().optional(),
});

export const jobResponseSchema = z.object({
  message: z.string().min(10).max(1000),
});
