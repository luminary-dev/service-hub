import { z } from "zod";
import { DISTRICTS } from "./constants";

const districtNames = [...DISTRICTS] as [string, ...string[]];

export const jobSchema = z.object({
  // Category membership is checked against provider-service's Category table
  // after parsing (routes/jobs.ts) — zod schemas are sync, and the list is
  // now data, not code. Districts stay a static enum.
  category: z.string().min(1).max(40),
  district: z.enum(districtNames),
  title: z.string().min(5).max(100),
  description: z.string().min(10).max(2000),
  // Whole LKR rupees — integers only at the edge, so float artifacts can
  // never enter; stored as DECIMAL(12,2) (#371).
  budget: z.number().int().min(100).max(100_000_000).nullable().optional(),
});

export const jobResponseSchema = z.object({
  message: z.string().min(10).max(1000),
});
