// Category / district / price-type vocabularies, copied from the monolith's
// src/lib/constants.ts (labels only — the icons stay in the web app).
export const CATEGORIES: readonly { slug: string; label: string }[] = [
  { slug: "mechanic", label: "Mechanic" },
  { slug: "electrician", label: "Electrician" },
  { slug: "plumber", label: "Plumber" },
  { slug: "carpenter", label: "Carpenter" },
  { slug: "mason", label: "Mason" },
  { slug: "painter", label: "Painter" },
  { slug: "garden-designer", label: "Garden Designer" },
  { slug: "ac-repair", label: "AC Repair" },
  { slug: "appliance-repair", label: "Appliance Repair" },
  { slug: "welder", label: "Welder" },
  { slug: "roofer", label: "Roofer" },
  { slug: "tile-layer", label: "Tile Layer" },
  { slug: "cctv-security", label: "CCTV & Security" },
  { slug: "pest-control", label: "Pest Control" },
  { slug: "cleaning", label: "Cleaning" },
  { slug: "movers", label: "Movers" },
];

export const DISTRICTS = [
  "Ampara", "Anuradhapura", "Badulla", "Batticaloa", "Colombo", "Galle",
  "Gampaha", "Hambantota", "Jaffna", "Kalutara", "Kandy", "Kegalle",
  "Kilinochchi", "Kurunegala", "Mannar", "Matale", "Matara", "Monaragala",
  "Mullaitivu", "Nuwara Eliya", "Polonnaruwa", "Puttalam", "Ratnapura",
  "Trincomalee", "Vavuniya",
] as const;

export const PRICE_TYPES = [
  { value: "HOURLY", label: "Per Hour" },
  { value: "DAILY", label: "Per Day" },
  { value: "FIXED", label: "Fixed Price" },
  { value: "VISIT", label: "Per Visit" },
] as const;
