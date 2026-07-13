import { describe, it, expect } from "vitest";
import { registerSchema } from "./register-schema";

const validCustomer = {
  role: "CUSTOMER",
  name: "Dilani Rajapaksa",
  email: "dilani@example.com",
  password: "example-passphrase",
  phone: "0711111111",
};

const validProvider = {
  role: "PROVIDER",
  name: "Nuwan Perera",
  email: "nuwan@example.com",
  password: "example-passphrase",
  phone: "0771234501",
  category: "mechanic",
  headline: "Honest auto repairs",
  bio: "I run a small workshop in Nugegoda handling everything from routine servicing to full engine rebuilds.",
  district: "Colombo",
  city: "Nugegoda",
  experience: 12,
  services: [{ title: "Full vehicle service", price: 12500, priceType: "FIXED" }],
};

describe("registerSchema — CUSTOMER", () => {
  it("accepts a valid customer", () => {
    const parsed = registerSchema.safeParse(validCustomer);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.role).toBe("CUSTOMER");
  });

  it("rejects an invalid email", () => {
    expect(
      registerSchema.safeParse({ ...validCustomer, email: "not-an-email" }).success
    ).toBe(false);
  });

  it("rejects a password shorter than 10 characters", () => {
    expect(
      registerSchema.safeParse({ ...validCustomer, password: "12345" }).success
    ).toBe(false);
    expect(
      registerSchema.safeParse({ ...validCustomer, password: "short1!" }).success
    ).toBe(false);
  });

  it("rejects a common / breached password even if long enough", () => {
    expect(
      registerSchema.safeParse({ ...validCustomer, password: "password123" })
        .success
    ).toBe(false);
    expect(
      registerSchema.safeParse({ ...validCustomer, password: "qwertyuiop" })
        .success
    ).toBe(false);
  });

  it("rejects a phone shorter than 9 characters", () => {
    expect(
      registerSchema.safeParse({ ...validCustomer, phone: "071" }).success
    ).toBe(false);
  });

  it("rejects a missing name", () => {
    const { name: _name, ...rest } = validCustomer;
    expect(registerSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an unknown role", () => {
    expect(
      registerSchema.safeParse({ ...validCustomer, role: "ADMIN" }).success
    ).toBe(false);
  });
});

describe("registerSchema — PROVIDER", () => {
  it("accepts a valid provider", () => {
    const parsed = registerSchema.safeParse(validProvider);
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.role === "PROVIDER") {
      expect(parsed.data.services).toHaveLength(1);
    }
  });

  it("accepts empty strings for optional social fields", () => {
    const parsed = registerSchema.safeParse({
      ...validProvider,
      whatsapp: "",
      phone2: "",
      facebook: "",
      instagram: "",
      tiktok: "",
      youtube: "",
      website: "",
    });
    expect(parsed.success).toBe(true);
  });

  it("requires provider profile fields (headline)", () => {
    const { headline: _headline, ...rest } = validProvider;
    expect(registerSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a bio shorter than 20 characters", () => {
    expect(
      registerSchema.safeParse({ ...validProvider, bio: "too short" }).success
    ).toBe(false);
  });

  it("rejects an empty services array", () => {
    expect(
      registerSchema.safeParse({ ...validProvider, services: [] }).success
    ).toBe(false);
  });

  it("rejects a service with a non-positive price", () => {
    expect(
      registerSchema.safeParse({
        ...validProvider,
        services: [{ title: "Job", price: 0, priceType: "FIXED" }],
      }).success
    ).toBe(false);
  });

  it("rejects an invalid priceType", () => {
    expect(
      registerSchema.safeParse({
        ...validProvider,
        services: [{ title: "Job", price: 100, priceType: "MONTHLY" }],
      }).success
    ).toBe(false);
  });

  // Multi-district service area (#502): optional, at most 5 valid districts;
  // the route unions the home district in and re-checks the cap.
  it("accepts an omitted or valid serviceDistricts list", () => {
    expect(registerSchema.safeParse(validProvider).success).toBe(true);
    expect(
      registerSchema.safeParse({
        ...validProvider,
        serviceDistricts: ["Colombo", "Gampaha", "Kalutara"],
      }).success
    ).toBe(true);
  });

  it("rejects an unknown district in serviceDistricts", () => {
    expect(
      registerSchema.safeParse({
        ...validProvider,
        serviceDistricts: ["Colombo", "Atlantis"],
      }).success
    ).toBe(false);
  });

  it("rejects more than 5 serviceDistricts", () => {
    expect(
      registerSchema.safeParse({
        ...validProvider,
        serviceDistricts: [
          "Colombo",
          "Gampaha",
          "Kalutara",
          "Kandy",
          "Galle",
          "Matara",
        ],
      }).success
    ).toBe(false);
  });

  it("rejects out-of-range experience", () => {
    expect(
      registerSchema.safeParse({ ...validProvider, experience: 61 }).success
    ).toBe(false);
    expect(
      registerSchema.safeParse({ ...validProvider, experience: -1 }).success
    ).toBe(false);
    expect(
      registerSchema.safeParse({ ...validProvider, experience: 1.5 }).success
    ).toBe(false);
  });
});
