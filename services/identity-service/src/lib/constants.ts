// Category slugs and district names, copied from the monolith's
// src/lib/constants.ts (plain string arrays — no labels/icons needed here).
export const CATEGORIES = [
  "mechanic",
  "electrician",
  "plumber",
  "carpenter",
  "mason",
  "painter",
  "garden-designer",
  "ac-repair",
  "appliance-repair",
  "welder",
  "roofer",
  "tile-layer",
  "cctv-security",
  "pest-control",
  "cleaning",
  "movers",
] as const;

export const DISTRICTS = [
  "Ampara", "Anuradhapura", "Badulla", "Batticaloa", "Colombo", "Galle",
  "Gampaha", "Hambantota", "Jaffna", "Kalutara", "Kandy", "Kegalle",
  "Kilinochchi", "Kurunegala", "Mannar", "Matale", "Matara", "Monaragala",
  "Mullaitivu", "Nuwara Eliya", "Polonnaruwa", "Puttalam", "Ratnapura",
  "Trincomalee", "Vavuniya",
] as const;
