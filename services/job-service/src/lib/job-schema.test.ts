import { describe, expect, it } from "vitest";
import { jobSchema, jobResponseSchema } from "./job-schema";

const validJob = {
  category: "plumber",
  district: "Colombo",
  title: "Fix leaking kitchen sink",
  description: "The kitchen sink has been leaking for a week and needs repair.",
  budget: 5000,
};

describe("jobSchema", () => {
  it("accepts a valid job", () => {
    const parsed = jobSchema.safeParse(validJob);
    expect(parsed.success).toBe(true);
  });

  it("accepts a job without a budget", () => {
    const { budget: _budget, ...rest } = validJob;
    expect(jobSchema.safeParse(rest).success).toBe(true);
  });

  it("accepts a null budget", () => {
    const parsed = jobSchema.safeParse({ ...validJob, budget: null });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.budget).toBeNull();
  });

  it("rejects a too-short title", () => {
    expect(jobSchema.safeParse({ ...validJob, title: "Fix" }).success).toBe(false);
  });

  it("rejects a title over 100 characters", () => {
    expect(
      jobSchema.safeParse({ ...validJob, title: "x".repeat(101) }).success
    ).toBe(false);
  });

  // Unknown-category rejection moved to the route's dynamic check against
  // provider-service's Category table — see categories.test.ts.
  it("rejects an empty category", () => {
    expect(jobSchema.safeParse({ ...validJob, category: "" }).success).toBe(
      false
    );
  });

  it("rejects an unknown district", () => {
    expect(
      jobSchema.safeParse({ ...validJob, district: "Atlantis" }).success
    ).toBe(false);
  });

  it("rejects a too-short description", () => {
    expect(
      jobSchema.safeParse({ ...validJob, description: "too short" }).success
    ).toBe(false);
  });

  it("rejects a budget below 100", () => {
    expect(jobSchema.safeParse({ ...validJob, budget: 99 }).success).toBe(false);
  });

  it("accepts the budget bounds", () => {
    expect(jobSchema.safeParse({ ...validJob, budget: 100 }).success).toBe(true);
    expect(
      jobSchema.safeParse({ ...validJob, budget: 100_000_000 }).success
    ).toBe(true);
  });

  it("rejects a budget above 100,000,000", () => {
    expect(
      jobSchema.safeParse({ ...validJob, budget: 100_000_001 }).success
    ).toBe(false);
  });

  it("rejects a non-integer budget", () => {
    expect(jobSchema.safeParse({ ...validJob, budget: 1500.5 }).success).toBe(
      false
    );
  });
});

describe("jobResponseSchema", () => {
  it("accepts a valid message", () => {
    expect(
      jobResponseSchema.safeParse({
        message: "I can come by tomorrow morning to take a look.",
      }).success
    ).toBe(true);
  });

  it("accepts the message bounds", () => {
    expect(
      jobResponseSchema.safeParse({ message: "x".repeat(10) }).success
    ).toBe(true);
    expect(
      jobResponseSchema.safeParse({ message: "x".repeat(1000) }).success
    ).toBe(true);
  });

  it("rejects a too-short message", () => {
    expect(jobResponseSchema.safeParse({ message: "short" }).success).toBe(false);
  });

  it("rejects a message over 1000 characters", () => {
    expect(
      jobResponseSchema.safeParse({ message: "x".repeat(1001) }).success
    ).toBe(false);
  });

  it("rejects a missing message", () => {
    expect(jobResponseSchema.safeParse({}).success).toBe(false);
  });
});
