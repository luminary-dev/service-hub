import type { IconType } from "react-icons";
import {
  FaBolt,
  FaBorderAll,
  FaBroom,
  FaBug,
  FaFire,
  FaHammer,
  FaHouseChimney,
  FaLeaf,
  FaPaintRoller,
  FaPlug,
  FaScrewdriverWrench,
  FaShower,
  FaSnowflake,
  FaTrowel,
  FaTruck,
  FaVideo,
  FaWrench,
} from "react-icons/fa6";

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

export function priceTypeLabel(value: string) {
  return PRICE_TYPES.find((p) => p.value === value)?.label ?? value;
}

export function formatLKR(amount: number) {
  return `Rs. ${amount.toLocaleString("en-LK")}`;
}
