export const CATEGORIES = [
  { slug: "mechanic", label: "Mechanic", icon: "🔧" },
  { slug: "electrician", label: "Electrician", icon: "⚡" },
  { slug: "plumber", label: "Plumber", icon: "🚿" },
  { slug: "carpenter", label: "Carpenter", icon: "🪚" },
  { slug: "mason", label: "Mason", icon: "🧱" },
  { slug: "painter", label: "Painter", icon: "🎨" },
  { slug: "garden-designer", label: "Garden Designer", icon: "🌿" },
  { slug: "ac-repair", label: "AC Repair", icon: "❄️" },
  { slug: "appliance-repair", label: "Appliance Repair", icon: "🔌" },
  { slug: "welder", label: "Welder", icon: "🔥" },
  { slug: "roofer", label: "Roofer", icon: "🏠" },
  { slug: "tile-layer", label: "Tile Layer", icon: "◼️" },
  { slug: "cctv-security", label: "CCTV & Security", icon: "📷" },
  { slug: "pest-control", label: "Pest Control", icon: "🐜" },
  { slug: "cleaning", label: "Cleaning", icon: "🧹" },
  { slug: "movers", label: "Movers", icon: "🚚" },
] as const;

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

export function categoryLabel(slug: string) {
  return CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;
}

export function categoryIcon(slug: string) {
  return CATEGORIES.find((c) => c.slug === slug)?.icon ?? "🛠️";
}

export function priceTypeLabel(value: string) {
  return PRICE_TYPES.find((p) => p.value === value)?.label ?? value;
}

export function formatLKR(amount: number) {
  return `Rs. ${amount.toLocaleString("en-LK")}`;
}
