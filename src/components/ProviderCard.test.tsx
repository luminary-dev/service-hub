// @vitest-environment jsdom
//
// Bilingual provider content (#515): the card headline renders the Sinhala
// variant under the `si` locale when present and falls back to the English
// original otherwise; the English locale always shows the English headline.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ProviderCard, { type ProviderCardDTO } from "./ProviderCard";

afterEach(cleanup);

const base: ProviderCardDTO = {
  id: "prov_1",
  userId: "user_1",
  name: "Sunil Perera",
  category: "electrician",
  categoryImageUrl: null,
  headline: "House wiring and repairs across Colombo",
  district: "Colombo",
  city: "Nugegoda",
  experience: 8,
  available: true,
  awayUntil: null,
  verificationStatus: "VERIFIED",
  verifiedAt: "2025-06-01T00:00:00.000Z",
  createdAt: "2024-01-15T00:00:00.000Z",
  avatarUrl: null,
  coverPhoto: null,
  photos: [],
  services: [],
  fromPrice: null,
  fromPriceType: null,
  rating: null,
  reviewCount: 0,
};

const SI_HEADLINE = "කොළඹ පුරා නිවාස වයරින් සහ අලුත්වැඩියා";

describe("ProviderCard bilingual headline (#515)", () => {
  it("renders the Sinhala headline under the si locale when present", () => {
    render(<ProviderCard p={{ ...base, headlineSi: SI_HEADLINE }} locale="si" />);
    expect(screen.getByText(SI_HEADLINE)).toBeTruthy();
    expect(screen.queryByText(base.headline)).toBeNull();
  });

  it("falls back to the English headline under si when no Sinhala variant", () => {
    render(<ProviderCard p={{ ...base, headlineSi: null }} locale="si" />);
    expect(screen.getByText(base.headline)).toBeTruthy();
  });

  it("always renders the English headline under the en locale", () => {
    render(<ProviderCard p={{ ...base, headlineSi: SI_HEADLINE }} locale="en" />);
    expect(screen.getByText(base.headline)).toBeTruthy();
    expect(screen.queryByText(SI_HEADLINE)).toBeNull();
  });
});
