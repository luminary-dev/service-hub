import { readFileSync, writeFileSync } from "node:fs";

// export name -> source. `filled` fills the (stroke-designed) Lucide path so
// solid Fa variants (heart/star/paper-plane) still read as solid.
const MAP = {
  FaArrowRight: ["l", "arrow-right"],
  FaArrowUpRightFromSquare: ["l", "external-link"],
  FaBars: ["l", "menu"],
  FaBolt: ["l", "zap"],
  FaBorderAll: ["l", "layout-grid"],
  FaBriefcase: ["l", "briefcase"],
  FaBroom: ["l", "spray-can"],
  FaBug: ["l", "bug"],
  FaChevronLeft: ["l", "chevron-left"],
  FaChevronRight: ["l", "chevron-right"],
  FaCircleCheck: ["l", "circle-check"],
  FaCircleExclamation: ["l", "circle-alert"],
  FaCircleXmark: ["l", "circle-x"],
  FaClock: ["l", "clock"],
  FaCommentDots: ["l", "message-circle"],
  FaCompass: ["l", "compass"],
  FaEnvelope: ["l", "mail"],
  FaEye: ["l", "eye"],
  FaEyeSlash: ["l", "eye-off"],
  FaFileLines: ["l", "file-text"],
  FaFire: ["l", "flame"],
  FaFlag: ["l", "flag"],
  FaGlobe: ["l", "globe"],
  FaHammer: ["l", "hammer"],
  FaHeart: ["l", "heart", true],
  FaHouse: ["l", "house"],
  FaHouseChimney: ["l", "house"],
  FaIdCard: ["l", "id-card"],
  FaInbox: ["l", "inbox"],
  FaLeaf: ["l", "leaf"],
  FaLocationDot: ["l", "map-pin"],
  FaMagnifyingGlass: ["l", "search"],
  FaMoon: ["l", "moon"],
  FaPaintRoller: ["l", "paint-roller"],
  FaPaperPlane: ["l", "send", true],
  FaPhone: ["l", "phone"],
  FaPlug: ["l", "plug"],
  FaPlus: ["l", "plus"],
  FaRegHeart: ["l", "heart"],
  FaRegPaperPlane: ["l", "send"],
  FaRegStar: ["l", "star"],
  FaScrewdriverWrench: ["l", "wrench"],
  FaShareNodes: ["l", "share-2"],
  FaShieldHalved: ["l", "shield-check"],
  FaShower: ["l", "shower-head"],
  FaSnowflake: ["l", "snowflake"],
  FaStar: ["l", "star", true],
  FaSun: ["l", "sun"],
  FaTags: ["l", "tags"],
  FaTrash: ["l", "trash-2"],
  FaTriangleExclamation: ["l", "triangle-alert"],
  FaTrowel: ["l", "brick-wall"],
  FaTruck: ["l", "truck"],
  FaUpload: ["l", "upload"],
  FaUsers: ["l", "users"],
  FaVideo: ["l", "video"],
  FaWrench: ["l", "wrench"],
  FaXmark: ["l", "x"],
  // Brand logos (Material/UI icon sets have none): simple-icons.
  FaFacebookF: ["b", "facebook"],
  FaInstagram: ["b", "instagram"],
  FaTiktok: ["b", "tiktok"],
  FaYoutube: ["b", "youtube"],
  FaWhatsapp: ["b", "whatsapp"],
};

function inner(svg) {
  let s = svg.replace(/<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  // Strip HTML comments, looping until stable so adjacent/overlapping comment
  // delimiters can't survive a single pass (satisfies CodeQL's
  // incomplete-multi-character-sanitization check).
  let prev;
  do {
    prev = s;
    s = s.replace(/<!--[\s\S]*?-->/g, "");
  } while (s !== prev);
  return s.replace(/\s+/g, " ").trim();
}

let body = "";
for (const [name, [src, icon, filled]] of Object.entries(MAP)) {
  const path =
    src === "l"
      ? `node_modules/lucide-static/icons/${icon}.svg`
      : `node_modules/simple-icons/icons/${icon}.svg`;
  const html = inner(readFileSync(path, "utf8"));
  const attrs =
    src === "b"
      ? `{...brand}`
      : filled
        ? `{...filledOutline}`
        : `{...outline}`;
  body += `export function ${name}(props: IconProps) {\n  return <svg ${attrs} aria-hidden {...props} dangerouslySetInnerHTML={{ __html: ${JSON.stringify(html)} }} />;\n}\n`;
}

const header = `// AUTO-GENERATED self-contained icon components (scripts/gen-icons.mjs).
// Exact SVGs copied from Lucide (UI icons) and simple-icons (brand logos) — the
// sets shadcn.io/icons aggregates — so there is no runtime icon dependency.
// Export names are kept as the former react-icons/fa6 identifiers so callers
// only changed their import path. className/size/color pass straight through.
import type { ReactElement, SVGProps } from "react";

// title is allowed for parity with react-icons (renders as an SVG tooltip).
type IconProps = SVGProps<SVGSVGElement> & { title?: string };

// Drop-in replacement for react-icons' IconType (callers that store an icon
// component in a typed field / map, e.g. category → icon).
export type IconType = (props: IconProps) => ReactElement;

const outline = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  width: "1em",
  height: "1em",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const filledOutline = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  width: "1em",
  height: "1em",
  fill: "currentColor",
  stroke: "none",
} as const;

const brand = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  width: "1em",
  height: "1em",
  fill: "currentColor",
} as const;

`;

writeFileSync("src/components/icons.tsx", header + body);
console.log(`generated src/components/icons.tsx with ${Object.keys(MAP).length} icons`);
