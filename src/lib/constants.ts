import type { IconType } from "@/components/icons";
import {
  FaBolt,
  FaBorderAll,
  FaBriefcase,
  FaBroom,
  FaBug,
  FaFire,
  FaGlobe,
  FaHammer,
  FaHouse,
  FaHouseChimney,
  FaLeaf,
  FaPaintRoller,
  FaPlug,
  FaScrewdriverWrench,
  FaShieldHalved,
  FaShower,
  FaSnowflake,
  FaTags,
  FaTrowel,
  FaTruck,
  FaVideo,
  FaWrench,
} from "@/components/icons";

export const CATEGORIES: readonly {
  slug: string;
  label: string;
  icon: IconType;
}[] = [
  { slug: "mechanic", label: "Mechanic", icon: FaWrench },
  { slug: "electrician", label: "Electrician", icon: FaBolt },
  { slug: "plumber", label: "Plumber", icon: FaShower },
  { slug: "carpenter", label: "Carpenter", icon: FaHammer },
  { slug: "mason", label: "Mason", icon: FaTrowel },
  { slug: "painter", label: "Painter", icon: FaPaintRoller },
  { slug: "garden-designer", label: "Garden Designer", icon: FaLeaf },
  { slug: "ac-repair", label: "AC Repair", icon: FaSnowflake },
  { slug: "appliance-repair", label: "Appliance Repair", icon: FaPlug },
  { slug: "welder", label: "Welder", icon: FaFire },
  { slug: "roofer", label: "Roofer", icon: FaHouseChimney },
  { slug: "tile-layer", label: "Tile Layer", icon: FaBorderAll },
  { slug: "cctv-security", label: "CCTV & Security", icon: FaVideo },
  { slug: "pest-control", label: "Pest Control", icon: FaBug },
  { slug: "cleaning", label: "Cleaning", icon: FaBroom },
  { slug: "movers", label: "Movers", icon: FaTruck },
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

export function categoryLabel(slug: string) {
  return CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;
}

export function categoryIcon(slug: string): IconType {
  return CATEGORIES.find((c) => c.slug === slug)?.icon ?? FaScrewdriverWrench;
}

// Curated set of category icons an admin can assign to a category (stored as
// the icon *name* in Category.icon). Keeping it a short, trade-relevant list
// (not every exported icon) makes the admin picker a sensible menu, and lets
// the UI resolve an admin-chosen icon by name — see `iconByName`. `#436`.
export const CATEGORY_ICONS: Record<string, IconType> = {
  FaWrench,
  FaScrewdriverWrench,
  FaBolt,
  FaShower,
  FaHammer,
  FaTrowel,
  FaPaintRoller,
  FaLeaf,
  FaSnowflake,
  FaPlug,
  FaFire,
  FaHouseChimney,
  FaHouse,
  FaBorderAll,
  FaVideo,
  FaShieldHalved,
  FaBug,
  FaBroom,
  FaTruck,
  FaBriefcase,
  FaTags,
  FaGlobe,
};

// The picker options, in insertion order.
export const CATEGORY_ICON_NAMES: readonly string[] = Object.keys(CATEGORY_ICONS);

// Resolve an admin-assigned icon name to its component. Null for unset / unknown
// names, so callers can fall back to the slug-based `categoryIcon`.
export function iconByName(name: string | null | undefined): IconType | null {
  return name ? CATEGORY_ICONS[name] ?? null : null;
}

export function priceTypeLabel(value: string) {
  return PRICE_TYPES.find((p) => p.value === value)?.label ?? value;
}

