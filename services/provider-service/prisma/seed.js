const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

// Managed categories (#135/#60). Slugs are the canonical list from the old
// src/lib/constants.ts copies; English labels come from the web constants,
// Sinhala labels from the web i18n dict, and `icon` is the react-icons
// identifier the web maps each slug to. sortOrder is spaced by 10 so admins
// can slot new categories in between.
const CATEGORIES = [
  { slug: "mechanic", labelEn: "Mechanic", labelSi: "රථ කාර්මික", icon: "FaWrench" },
  { slug: "electrician", labelEn: "Electrician", labelSi: "විදුලි කාර්මික", icon: "FaBolt" },
  { slug: "plumber", labelEn: "Plumber", labelSi: "ජලනළ කාර්මික", icon: "FaShower" },
  { slug: "carpenter", labelEn: "Carpenter", labelSi: "වඩු කාර්මික", icon: "FaHammer" },
  { slug: "mason", labelEn: "Mason", labelSi: "පෙදරේරු", icon: "FaTrowel" },
  { slug: "painter", labelEn: "Painter", labelSi: "තීන්ත ආලේපක", icon: "FaPaintRoller" },
  { slug: "garden-designer", labelEn: "Garden Designer", labelSi: "උද්‍යාන නිර්මාණකරු", icon: "FaLeaf" },
  { slug: "ac-repair", labelEn: "AC Repair", labelSi: "A/C අලුත්වැඩියා", icon: "FaSnowflake" },
  { slug: "appliance-repair", labelEn: "Appliance Repair", labelSi: "ගෘහ උපකරණ අලුත්වැඩියා", icon: "FaPlug" },
  { slug: "welder", labelEn: "Welder", labelSi: "වෙල්ඩින් කාර්මික", icon: "FaFire" },
  { slug: "roofer", labelEn: "Roofer", labelSi: "වහල කාර්මික", icon: "FaHouseChimney" },
  { slug: "tile-layer", labelEn: "Tile Layer", labelSi: "ටයිල් කාර්මික", icon: "FaBorderAll" },
  { slug: "cctv-security", labelEn: "CCTV & Security", labelSi: "CCTV සහ ආරක්ෂණ", icon: "FaVideo" },
  { slug: "pest-control", labelEn: "Pest Control", labelSi: "පළිබෝධ පාලනය", icon: "FaBug" },
  { slug: "cleaning", labelEn: "Cleaning", labelSi: "පිරිසිදු කිරීම", icon: "FaBroom" },
  { slug: "movers", labelEn: "Movers", labelSi: "බඩු ප්‍රවාහනය", icon: "FaTruck" },
].map((c, i) => ({
  ...c,
  active: true,
  sortOrder: (i + 1) * 10,
  // Default cover image (#436) — a dedicated per-trade cover photo per slug
  // (public/images/categories/<slug>.jpg). Admins can replace it via the
  // category manager; a reseed restores this default (dev only).
  imageUrl: `/images/categories/${c.slug}.jpg`,
}));

// Deterministic IDs so cross-service references line up with the
// identity-service seed (user_*) and the review/job seeds (prov_*).
// Photo URLs keep the monolith form — the seed SVGs live in the web app's
// public/uploads/seed/ directory and are served from there.
const PROVIDERS = [
  {
    id: "prov_nuwan",
    avatarUrl: "/uploads/seed/avatars/prov_nuwan.jpg",
    userId: "user_nuwan",
    name: "Nuwan Perera",
    email: "nuwan@example.com",
    phone: "0771234501",
    category: "mechanic",
    headline: "Honest auto repairs — Japanese & European vehicles",
    bio: "I run a small workshop in Nugegoda handling everything from routine servicing to full engine rebuilds. Specialised in Toyota, Nissan and Suzuki, with diagnostic equipment for European makes too. I always explain the problem and the price before touching a bolt.",
    district: "Colombo",
    serviceDistricts: ["Colombo", "Gampaha", "Kalutara"],
    city: "Nugegoda",
    // Map pin (#48): a couple of demo providers carry one so the profile
    // mini-map and (later) map search are demoable; the rest stay unpinned.
    latitude: 6.8649,
    longitude: 79.8997,
    experience: 12,
    whatsapp: "94771234501",
    facebook: "facebook.com/nuwanautocare",
    services: [
      { title: "Full vehicle service", price: 12500, priceType: "FIXED" },
      { title: "Brake pad replacement (labour)", price: 4500, priceType: "FIXED" },
      { title: "Engine diagnostics", price: 3000, priceType: "VISIT" },
    ],
    photos: ["Engine bay after full service", "Brake overhaul on a Prius"],
  },
  {
    id: "prov_sampath",
    avatarUrl: "/uploads/seed/avatars/prov_sampath.jpg",
    userId: "user_sampath",
    name: "Sampath Jayasuriya",
    email: "sampath@example.com",
    phone: "0712345602",
    category: "electrician",
    headline: "Certified electrician for homes & small businesses",
    bio: "CEB-experienced electrician covering Gampaha and Colombo suburbs. House wiring, distribution board upgrades, fault finding, and solar PV connections. All work done to standard with proper earthing — safety first, always.",
    district: "Gampaha",
    serviceDistricts: ["Gampaha", "Colombo"],
    city: "Kadawatha",
    latitude: 7.0012,
    longitude: 79.95,
    experience: 15,
    whatsapp: "94712345602",
    youtube: "youtube.com/@sampathelectrical",
    services: [
      { title: "Full house wiring (per point)", price: 2800, priceType: "FIXED" },
      { title: "Fault finding & repair", price: 2000, priceType: "VISIT" },
      { title: "DB board upgrade", price: 18000, priceType: "FIXED" },
    ],
    photos: ["New distribution board install", "Rewiring a two-storey house"],
  },
  {
    id: "prov_kumari",
    avatarUrl: "/uploads/seed/avatars/prov_kumari.jpg",
    userId: "user_kumari",
    name: "Kumari Wickramasinghe",
    email: "kumari@example.com",
    phone: "0763456703",
    category: "garden-designer",
    headline: "Tropical garden design that thrives in our climate",
    bio: "Landscape designer with a diploma in horticulture. I design and build home gardens, rooftop green spaces and courtyard gardens using native plants that love Sri Lankan weather. From a single flower bed to a complete garden makeover with water features.",
    district: "Kandy",
    serviceDistricts: ["Kandy", "Matale", "Nuwara Eliya"],
    city: "Peradeniya",
    experience: 8,
    whatsapp: "94763456703",
    instagram: "instagram.com/kumari.gardens",
    facebook: "facebook.com/kumarigardens",
    services: [
      { title: "Garden design consultation", price: 5000, priceType: "VISIT" },
      { title: "Full garden makeover", price: 150000, priceType: "FIXED" },
      { title: "Monthly garden maintenance", price: 12000, priceType: "FIXED" },
    ],
    photos: [
      "Courtyard garden in Kandy",
      "Water feature & rockery",
      "Rooftop herb garden",
    ],
  },
  {
    id: "prov_roshan",
    avatarUrl: "/uploads/seed/avatars/prov_roshan.jpg",
    userId: "user_roshan",
    name: "Roshan Fernando",
    email: "roshan@example.com",
    phone: "0754567804",
    category: "plumber",
    headline: "Fast, tidy plumbing — leaks fixed the same day",
    bio: "Plumber based in Moratuwa covering Colombo south. Leak repairs, bathroom fittings, water pump installation, and complete pipe layouts for new builds. I carry common spares in the van so most jobs finish in one visit.",
    district: "Colombo",
    serviceDistricts: ["Colombo", "Kalutara"],
    city: "Moratuwa",
    experience: 10,
    whatsapp: "94754567804",
    services: [
      { title: "Leak repair", price: 2500, priceType: "VISIT" },
      { title: "Water pump installation", price: 8000, priceType: "FIXED" },
      { title: "Bathroom fit-out (labour)", price: 45000, priceType: "FIXED" },
    ],
    photos: ["Pump house installation"],
  },
  {
    id: "prov_rizwan",
    avatarUrl: "/uploads/seed/avatars/prov_rizwan.jpg",
    userId: "user_rizwan",
    name: "Mohamed Rizwan",
    email: "rizwan@example.com",
    phone: "0705678905",
    category: "ac-repair",
    headline: "AC installation, servicing & gas refilling",
    bio: "Air conditioning technician serving Colombo and Kalutara. Split AC installation, chemical wash servicing, gas top-ups and compressor repairs for all major brands. Quick response for breakdowns — nobody should sweat through the night.",
    district: "Colombo",
    serviceDistricts: ["Colombo", "Kalutara"],
    city: "Dehiwala",
    experience: 7,
    whatsapp: "94705678905",
    tiktok: "tiktok.com/@rizwancooling",
    services: [
      { title: "Split AC installation", price: 15000, priceType: "FIXED" },
      { title: "AC chemical wash", price: 6500, priceType: "FIXED" },
      { title: "Gas refill (R32)", price: 9000, priceType: "FIXED" },
    ],
    photos: ["Split unit install in Dehiwala"],
  },
  {
    id: "prov_chaminda",
    avatarUrl: "/uploads/seed/avatars/prov_chaminda.jpg",
    userId: "user_chaminda",
    name: "Chaminda Silva",
    email: "chaminda@example.com",
    phone: "0776789006",
    category: "carpenter",
    headline: "Custom furniture & pantry cupboards in teak and mahogany",
    bio: "Third-generation carpenter from Galle. I build pantry cupboards, wardrobes, beds and dining tables to order, and handle door/window framing for new houses. Quality timber, proper joinery, and finishes that last decades.",
    district: "Galle",
    serviceDistricts: ["Galle"],
    city: "Galle",
    experience: 20,
    whatsapp: "94776789006",
    facebook: "facebook.com/chamindawoodworks",
    services: [
      { title: "Pantry cupboards (per ft)", price: 9500, priceType: "FIXED" },
      { title: "Custom wardrobe", price: 85000, priceType: "FIXED" },
      { title: "Carpentry day rate", price: 6000, priceType: "DAILY" },
    ],
    photos: ["Teak pantry in Galle Fort home", "Mahogany dining set"],
  },
];

// 44 more providers spanning all 16 categories and ~20 districts, added for
// the seed-data expansion (#632). Ids/avatars line up 1:1 with
// identity-service's NEW_PROVIDER_USERS (user_p### <-> prov_p###). Unlike
// PROVIDERS above, `photos` here is already `{url, caption}` — generated from
// a shared per-category photo pool (public/uploads/seed/pool/) rather than
// one unique image per provider.


const NEW_PROVIDERS = [
  {
    id: "prov_p007", userId: "user_p007", name: "Nadeeka Jayawardena", email: "nadeeka.jayawardena7@example.com", phone: "0771000266",
    category: "mechanic", headline: "Reliable vehicle repairs and servicing",
    bio: "Based in Colombo, I've been working in mechanic for 1 year, covering Colombo and nearby areas. From engine diagnostics to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Colombo", serviceDistricts: ["Colombo","Gampaha","Kalutara"], city: "Colombo",
    
    experience: 1,
    whatsapp: "94710008659",
    youtube: "youtube.com/p007mechanic",
    avatarUrl: "/uploads/seed/avatars/prov_p007.jpg",
    
    suspended: false,
    verificationStatus: "VERIFIED",
    verifiedAt: new Date("2026-02-17T09:00:00Z"),
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-02.jpg" },
    services: [{"title":"Full oil change service","price":4800,"priceType":"VISIT"},{"title":"AC gas refill","price":5800,"priceType":"DAILY"},{"title":"Battery replacement","price":8900,"priceType":"FIXED"}],
    photos: [{"url":"/uploads/seed/pool/mechanic-d.jpg","caption":"Reliable vehicle repairs and servicing — job in Colombo"},{"url":"/uploads/seed/pool/mechanic-a.jpg","caption":"Recent mechanic work, Colombo"},{"url":"/uploads/seed/pool/mechanic-b.jpg","caption":"On-site in Colombo"}],
  },
  {
    id: "prov_p008", userId: "user_p008", name: "Dinesh Amarasinghe", email: "dinesh.amarasinghe8@example.com", phone: "0781000304",
    category: "electrician", headline: "Licensed electrical work, wiring and repairs",
    bio: "Based in Negombo, I've been working in electrician for 4 years, covering Gampaha and nearby areas. From house rewiring (per room) to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Gampaha", serviceDistricts: ["Gampaha","Colombo","Kalutara"], city: "Negombo",
    
    experience: 4,
    whatsapp: "94710009896",
    facebook: "facebook.com/p008electrician",
    avatarUrl: "/uploads/seed/avatars/prov_p008.jpg",
    
    suspended: false,
    verificationStatus: "VERIFIED",
    verifiedAt: new Date("2026-03-18T09:00:00Z"),
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-03.jpg" },
    services: [{"title":"Emergency callout","price":2600,"priceType":"DAILY"},{"title":"Inverter/solar wiring","price":12000,"priceType":"FIXED"},{"title":"House rewiring (per room)","price":9300,"priceType":"VISIT"},{"title":"Circuit breaker installation","price":8600,"priceType":"DAILY"}],
    photos: [{"url":"/uploads/seed/pool/electrician-a.jpg","caption":"Licensed electrical work, wiring and repairs — job in Negombo"},{"url":"/uploads/seed/pool/electrician-b.jpg","caption":"Recent electrician work, Gampaha"}],
  },
  {
    id: "prov_p009", userId: "user_p009", name: "Chathura Hameed", email: "chathura.hameed9@example.com", phone: "0791000342",
    category: "plumber", headline: "Fast, tidy plumbing repairs and installations",
    bio: "Based in Kalutara, I've been working in plumber for 7 years, covering Kalutara and nearby areas. From leak repair to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Kalutara", serviceDistricts: ["Kalutara","Colombo"], city: "Kalutara",
    
    experience: 7,
    whatsapp: "94710011133",
    instagram: "instagram.com/p009plumber",
    avatarUrl: "/uploads/seed/avatars/prov_p009.jpg",
    
    suspended: false,
    verificationStatus: "VERIFIED",
    verifiedAt: new Date("2026-04-10T09:00:00Z"),
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-04.jpg" },
    services: [{"title":"Blocked drain clearing","price":3100,"priceType":"FIXED"},{"title":"Leak repair","price":3400,"priceType":"VISIT"}],
    photos: [{"url":"/uploads/seed/pool/plumber-b.jpg","caption":"Fast, tidy plumbing repairs and installations — job in Kalutara"},{"url":"/uploads/seed/pool/plumber-c.jpg","caption":"Recent plumber work, Kalutara"},{"url":"/uploads/seed/pool/plumber-d.jpg","caption":"On-site in Kalutara"}],
  },
  {
    id: "prov_p010", userId: "user_p010", name: "Nimali Dissanayake", email: "nimali.dissanayake10@example.com", phone: "0701000370",
    category: "carpenter", headline: "Custom furniture and woodwork, built to last",
    bio: "Based in Kandy, I've been working in carpenter for 10 years, covering Kandy and nearby areas. From custom wardrobe build to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Kandy", serviceDistricts: ["Kandy","Matale","Nuwara Eliya"], city: "Kandy",
    
    experience: 10,
    whatsapp: "94710012370",
    tiktok: "tiktok.com/p010carpenter",
    avatarUrl: "/uploads/seed/avatars/prov_p010.jpg",
    suspended: false,
    verificationStatus: "VERIFIED",
    verifiedAt: new Date("2026-05-11T09:00:00Z"),
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-05.jpg" },
    services: [{"title":"Custom wardrobe build","price":41500,"priceType":"VISIT"},{"title":"Door/window frame repair","price":6700,"priceType":"DAILY"},{"title":"Furniture polishing","price":9300,"priceType":"FIXED"}],
    photos: [{"url":"/uploads/seed/pool/carpenter-c.jpg","caption":"Custom furniture and woodwork, built to last — job in Kandy"},{"url":"/uploads/seed/pool/carpenter-d.jpg","caption":"Recent carpenter work, Kandy"}],
  },
  {
    id: "prov_p011", userId: "user_p011", name: "Saman Abeysekera", email: "saman.abeysekera11@example.com", phone: "0711000408",
    category: "mason", headline: "Quality masonry and construction work",
    bio: "Based in Matale, I've been working in mason for 13 years, covering Matale and nearby areas. From wall construction (per sq ft) to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Matale", serviceDistricts: ["Matale","Kandy","Anuradhapura"], city: "Matale",
    latitude: 7.4175, longitude: 80.5884,
    experience: 13,
    whatsapp: "94710013607",
    youtube: "youtube.com/p011mason",
    avatarUrl: "/uploads/seed/avatars/prov_p011.jpg",
    
    suspended: false,
    verificationStatus: "PENDING",
    
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-06.jpg" },
    services: [{"title":"Plastering","price":800,"priceType":"DAILY"},{"title":"Tiling foundation work","price":24400,"priceType":"FIXED"},{"title":"Boundary wall repair","price":6100,"priceType":"VISIT"},{"title":"Concrete flooring","price":1200,"priceType":"DAILY"}],
    photos: [{"url":"/uploads/seed/pool/mason-d.jpg","caption":"Quality masonry and construction work — job in Matale"},{"url":"/uploads/seed/pool/mason-a.jpg","caption":"Recent mason work, Matale"},{"url":"/uploads/seed/pool/mason-b.jpg","caption":"On-site in Matale"}],
  },
  {
    id: "prov_p012", userId: "user_p012", name: "Ruwan Fernando", email: "ruwan.fernando12@example.com", phone: "0721000446",
    category: "painter", headline: "Neat interior and exterior painting",
    bio: "Based in Nuwara Eliya, I've been working in painter for 16 years, covering Nuwara Eliya and nearby areas. From interior painting (per room) to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Nuwara Eliya", serviceDistricts: ["Nuwara Eliya","Kandy"], city: "Nuwara Eliya",
    
    experience: 16,
    whatsapp: "94710014844",
    facebook: "facebook.com/p012painter",
    avatarUrl: "/uploads/seed/avatars/prov_p012.jpg",
    
    suspended: false,
    verificationStatus: "PENDING",
    
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-01.jpg" },
    services: [{"title":"Wood varnishing","price":8900,"priceType":"FIXED"},{"title":"Waterproof coating","price":27300,"priceType":"VISIT"}],
    photos: [{"url":"/uploads/seed/pool/painter-a.jpg","caption":"Neat interior and exterior painting — job in Nuwara Eliya"},{"url":"/uploads/seed/pool/painter-b.jpg","caption":"Recent painter work, Nuwara Eliya"}],
  },
  {
    id: "prov_p013", userId: "user_p013", name: "Yasodha Herath", email: "yasodha.herath13@example.com", phone: "0731000484",
    category: "garden-designer", headline: "Tropical garden design that thrives in our climate",
    bio: "Based in Galle, I've been working in garden designer for 19 years, covering Galle and nearby areas. From full garden landscaping to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Galle", serviceDistricts: ["Galle","Matara","Kalutara"], city: "Galle",
    latitude: 6.0235, longitude: 80.2000,
    experience: 19,
    whatsapp: "94710016081",
    instagram: "instagram.com/p013garden",
    avatarUrl: "/uploads/seed/avatars/prov_p013.jpg",
    
    suspended: false,
    verificationStatus: "REJECTED",
    
    rejectionReason: "NIC photo was blurry — please re-upload a clear photo of both sides.",
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-02.jpg" },
    services: [{"title":"Irrigation system setup","price":32300,"priceType":"VISIT"},{"title":"Tropical planting design","price":34500,"priceType":"DAILY"},{"title":"Full garden landscaping","price":48900,"priceType":"FIXED"}],
    photos: [{"url":"/uploads/seed/pool/garden-designer-b.jpg","caption":"Tropical garden design that thrives in our climate — job in Galle"},{"url":"/uploads/seed/pool/garden-designer-c.jpg","caption":"Recent garden designer work, Galle"},{"url":"/uploads/seed/pool/garden-designer-d.jpg","caption":"On-site in Galle"}],
  },
  {
    id: "prov_p014", userId: "user_p014", name: "Lasantha Ismail", email: "lasantha.ismail14@example.com", phone: "0741000522",
    category: "ac-repair", headline: "AC installation, servicing and repair",
    bio: "Based in Matara, I've been working in ac repair for 2 years, covering Matara and nearby areas. From ac gas refill + service to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Matara", serviceDistricts: ["Matara","Galle","Hambantota"], city: "Matara",
    
    experience: 2,
    whatsapp: "94710017318",
    tiktok: "tiktok.com/p014ac",
    avatarUrl: "/uploads/seed/avatars/prov_p014.jpg",
    
    suspended: false,
    verificationStatus: "NONE",
    
    
    
    services: [{"title":"Duct cleaning","price":12600,"priceType":"DAILY"},{"title":"AC gas refill + service","price":5400,"priceType":"FIXED"},{"title":"New AC installation","price":17200,"priceType":"VISIT"},{"title":"AC deep cleaning","price":6100,"priceType":"DAILY"}],
    photos: [{"url":"/uploads/seed/pool/ac-repair-c.jpg","caption":"AC installation, servicing and repair — job in Matara"},{"url":"/uploads/seed/pool/ac-repair-d.jpg","caption":"Recent ac repair work, Matara"}],
  },
  {
    id: "prov_p015", userId: "user_p015", name: "Damith Bandara", email: "damith.bandara15@example.com", phone: "0751000560",
    category: "appliance-repair", headline: "Home appliance repairs, done right",
    bio: "Based in Tangalle, I've been working in appliance repair for 5 years, covering Hambantota and nearby areas. From washing machine repair to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Hambantota", serviceDistricts: ["Hambantota","Matara"], city: "Tangalle",
    latitude: 6.1141, longitude: 81.1115,
    experience: 5,
    whatsapp: "94710018555",
    youtube: "youtube.com/p015appliance",
    avatarUrl: "/uploads/seed/avatars/prov_p015.jpg",
    
    suspended: false,
    verificationStatus: "NONE",
    
    
    
    services: [{"title":"Washing machine repair","price":7800,"priceType":"FIXED"},{"title":"Refrigerator repair","price":4800,"priceType":"VISIT"}],
    photos: [{"url":"/uploads/seed/pool/appliance-repair-d.jpg","caption":"Home appliance repairs, done right — job in Tangalle"},{"url":"/uploads/seed/pool/appliance-repair-a.jpg","caption":"Recent appliance repair work, Hambantota"},{"url":"/uploads/seed/pool/appliance-repair-b.jpg","caption":"On-site in Tangalle"}],
  },
  {
    id: "prov_p016", userId: "user_p016", name: "Selvarani Mendis", email: "selvarani.mendis16@example.com", phone: "0761000598",
    category: "welder", headline: "Custom metal fabrication and welding",
    bio: "Based in Jaffna, I've been working in welder for 8 years, covering Jaffna and nearby areas. From gate fabrication to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Jaffna", serviceDistricts: ["Jaffna","Kilinochchi","Mannar"], city: "Jaffna",
    
    experience: 8,
    whatsapp: "94710019792",
    facebook: "facebook.com/p016welder",
    avatarUrl: "/uploads/seed/avatars/prov_p016.jpg",
    
    suspended: false,
    verificationStatus: "NONE",
    
    
    
    services: [{"title":"Window grill fabrication","price":9400,"priceType":"VISIT"},{"title":"Staircase railing","price":34800,"priceType":"DAILY"},{"title":"Structural steel welding","price":11600,"priceType":"FIXED"}],
    photos: [{"url":"/uploads/seed/pool/welder-a.jpg","caption":"Custom metal fabrication and welding — job in Jaffna"},{"url":"/uploads/seed/pool/welder-b.jpg","caption":"Recent welder work, Jaffna"}],
  },
  {
    id: "prov_p017", userId: "user_p017", name: "Malith Silva", email: "malith.silva17@example.com", phone: "0771000636",
    category: "roofer", headline: "Roofing repairs and installation specialist",
    bio: "Based in Batticaloa, I've been working in roofer for 11 years, covering Batticaloa and nearby areas. From roof sheet replacement to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Batticaloa", serviceDistricts: ["Batticaloa","Ampara","Polonnaruwa"], city: "Batticaloa",
    latitude: 7.7202, longitude: 81.6994,
    experience: 11,
    whatsapp: "94710021029",
    instagram: "instagram.com/p017roofer",
    avatarUrl: "/uploads/seed/avatars/prov_p017.jpg",
    
    suspended: false,
    verificationStatus: "VERIFIED",
    verifiedAt: new Date("2026-06-18T09:00:00Z"),
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-03.jpg" },
    services: [{"title":"Gutter installation","price":10500,"priceType":"DAILY"},{"title":"Full re-roofing (per sq ft)","price":1000,"priceType":"FIXED"},{"title":"Roof inspection","price":3600,"priceType":"VISIT"},{"title":"Roof sheet replacement","price":17800,"priceType":"DAILY"}],
    photos: [{"url":"/uploads/seed/pool/roofer-b.jpg","caption":"Roofing repairs and installation specialist — job in Batticaloa"},{"url":"/uploads/seed/pool/roofer-c.jpg","caption":"Recent roofer work, Batticaloa"},{"url":"/uploads/seed/pool/roofer-d.jpg","caption":"On-site in Batticaloa"}],
  },
  {
    id: "prov_p018", userId: "user_p018", name: "Tharaka Senanayake", email: "tharaka.senanayake18@example.com", phone: "0781000674",
    category: "tile-layer", headline: "Precise tiling for floors, walls and bathrooms",
    bio: "Based in Trincomalee, I've been working in tile layer for 14 years, covering Trincomalee and nearby areas. From floor tiling (per sq ft) to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Trincomalee", serviceDistricts: ["Trincomalee","Polonnaruwa"], city: "Trincomalee",
    
    experience: 14,
    whatsapp: "94710022266",
    tiktok: "tiktok.com/p018tile",
    avatarUrl: "/uploads/seed/avatars/prov_p018.jpg",
    
    suspended: false,
    verificationStatus: "VERIFIED",
    verifiedAt: new Date("2026-01-10T09:00:00Z"),
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-04.jpg" },
    services: [{"title":"Kitchen backsplash tiling","price":12100,"priceType":"FIXED"},{"title":"Outdoor tiling","price":500,"priceType":"VISIT"}],
    photos: [{"url":"/uploads/seed/pool/tile-layer-c.jpg","caption":"Precise tiling for floors, walls and bathrooms — job in Trincomalee"},{"url":"/uploads/seed/pool/tile-layer-d.jpg","caption":"Recent tile layer work, Trincomalee"}],
  },
  {
    id: "prov_p019", userId: "user_p019", name: "Farhana Nadesan", email: "farhana.nadesan19@example.com", phone: "0791000712",
    category: "cctv-security", headline: "CCTV and home security system installation",
    bio: "Based in Kalmunai, I've been working in cctv security for 17 years, covering Ampara and nearby areas. From 4-camera cctv installation to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Ampara", serviceDistricts: ["Ampara","Batticaloa","Monaragala"], city: "Kalmunai",
    latitude: 7.3275, longitude: 81.6957,
    experience: 17,
    whatsapp: "94710023503",
    youtube: "youtube.com/p019cctv",
    avatarUrl: "/uploads/seed/avatars/prov_p019.jpg",
    
    suspended: false,
    verificationStatus: "VERIFIED",
    verifiedAt: new Date("2026-02-11T09:00:00Z"),
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-05.jpg" },
    services: [{"title":"Remote monitoring setup","price":12700,"priceType":"VISIT"},{"title":"4-camera CCTV installation","price":61600,"priceType":"DAILY"},{"title":"CCTV system maintenance","price":5400,"priceType":"FIXED"}],
    photos: [{"url":"/uploads/seed/pool/cctv-security-d.jpg","caption":"CCTV and home security system installation — job in Kalmunai"},{"url":"/uploads/seed/pool/cctv-security-a.jpg","caption":"Recent cctv security work, Ampara"},{"url":"/uploads/seed/pool/cctv-security-b.jpg","caption":"On-site in Kalmunai"}],
  },
  {
    id: "prov_p020", userId: "user_p020", name: "Gayan Rajapaksa", email: "gayan.rajapaksa20@example.com", phone: "0701000740",
    category: "pest-control", headline: "Safe, effective pest control for home and office",
    bio: "Based in Kurunegala, I've been working in pest control for 20 years, covering Kurunegala and nearby areas. From full house pest treatment to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Kurunegala", serviceDistricts: ["Kurunegala","Puttalam","Anuradhapura"], city: "Kurunegala",
    
    experience: 20,
    whatsapp: "94710024740",
    facebook: "facebook.com/p020pest",
    avatarUrl: "/uploads/seed/avatars/prov_p020.jpg",
    suspended: false,
    verificationStatus: "VERIFIED",
    verifiedAt: new Date("2026-03-12T09:00:00Z"),
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-06.jpg" },
    services: [{"title":"Full house pest treatment","price":11400,"priceType":"DAILY"},{"title":"Termite treatment","price":32500,"priceType":"FIXED"},{"title":"Mosquito fogging","price":3700,"priceType":"VISIT"},{"title":"Rodent control","price":6400,"priceType":"DAILY"}],
    photos: [{"url":"/uploads/seed/pool/pest-control-a.jpg","caption":"Safe, effective pest control for home and office — job in Kurunegala"},{"url":"/uploads/seed/pool/pest-control-b.jpg","caption":"Recent pest control work, Kurunegala"}],
  },
  {
    id: "prov_p021", userId: "user_p021", name: "Dilshan Wijesinghe", email: "dilshan.wijesinghe21@example.com", phone: "0711000778",
    category: "cleaning", headline: "Thorough home and office cleaning services",
    bio: "Based in Chilaw, I've been working in cleaning for 3 years, covering Puttalam and nearby areas. From full house deep cleaning to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Puttalam", serviceDistricts: ["Puttalam","Kurunegala"], city: "Chilaw",
    latitude: 8.0862, longitude: 79.8633,
    experience: 3,
    whatsapp: "94710025977",
    instagram: "instagram.com/p021cleaning",
    avatarUrl: "/uploads/seed/avatars/prov_p021.jpg",
    
    suspended: false,
    verificationStatus: "PENDING",
    
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-01.jpg" },
    services: [{"title":"Sofa/carpet shampooing","price":8400,"priceType":"FIXED"},{"title":"Post-construction cleaning","price":12400,"priceType":"VISIT"}],
    photos: [{"url":"/uploads/seed/pool/cleaning-b.jpg","caption":"Thorough home and office cleaning services — job in Chilaw"},{"url":"/uploads/seed/pool/cleaning-c.jpg","caption":"Recent cleaning work, Puttalam"},{"url":"/uploads/seed/pool/cleaning-d.jpg","caption":"On-site in Chilaw"}],
  },
  {
    id: "prov_p022", userId: "user_p022", name: "Hasini Perera", email: "hasini.perera22@example.com", phone: "0721000816",
    category: "movers", headline: "Careful, on-time moving and relocation",
    bio: "Based in Anuradhapura, I've been working in movers for 6 years, covering Anuradhapura and nearby areas. From full house moving (van + 2 staff) to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Anuradhapura", serviceDistricts: ["Anuradhapura","Polonnaruwa","Kurunegala"], city: "Anuradhapura",
    
    experience: 6,
    whatsapp: "94710027214",
    tiktok: "tiktok.com/p022movers",
    avatarUrl: "/uploads/seed/avatars/prov_p022.jpg",
    
    suspended: false,
    verificationStatus: "PENDING",
    
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-02.jpg" },
    services: [{"title":"Single item delivery","price":7300,"priceType":"VISIT"},{"title":"Packing service","price":6100,"priceType":"DAILY"},{"title":"Long-distance moving","price":56400,"priceType":"FIXED"}],
    photos: [{"url":"/uploads/seed/pool/movers-c.jpg","caption":"Careful, on-time moving and relocation — job in Anuradhapura"},{"url":"/uploads/seed/pool/movers-d.jpg","caption":"Recent movers work, Anuradhapura"}],
  },
  {
    id: "prov_p023", userId: "user_p023", name: "Buddhika Weerasinghe", email: "buddhika.weerasinghe23@example.com", phone: "0731000854",
    category: "mechanic", headline: "Reliable vehicle repairs and servicing",
    bio: "Based in Polonnaruwa, I've been working in mechanic for 9 years, covering Polonnaruwa and nearby areas. From engine diagnostics to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Polonnaruwa", serviceDistricts: ["Polonnaruwa","Anuradhapura","Batticaloa"], city: "Polonnaruwa",
    latitude: 7.9003, longitude: 80.9908,
    experience: 9,
    whatsapp: "94710028451",
    youtube: "youtube.com/p023mechanic",
    avatarUrl: "/uploads/seed/avatars/prov_p023.jpg",
    
    suspended: false,
    verificationStatus: "REJECTED",
    
    rejectionReason: "NIC photo was blurry — please re-upload a clear photo of both sides.",
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-03.jpg" },
    services: [{"title":"AC gas refill","price":9000,"priceType":"DAILY"},{"title":"Battery replacement","price":7700,"priceType":"FIXED"},{"title":"Engine diagnostics","price":5200,"priceType":"VISIT"},{"title":"Brake pad replacement","price":7400,"priceType":"DAILY"}],
    photos: [{"url":"/uploads/seed/pool/mechanic-d.jpg","caption":"Reliable vehicle repairs and servicing — job in Polonnaruwa"},{"url":"/uploads/seed/pool/mechanic-a.jpg","caption":"Recent mechanic work, Polonnaruwa"},{"url":"/uploads/seed/pool/mechanic-b.jpg","caption":"On-site in Polonnaruwa"}],
  },
  {
    id: "prov_p024", userId: "user_p024", name: "Prasanna Thevar", email: "prasanna.thevar24@example.com", phone: "0741000892",
    category: "electrician", headline: "Licensed electrical work, wiring and repairs",
    bio: "Based in Badulla, I've been working in electrician for 12 years, covering Badulla and nearby areas. From house rewiring (per room) to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Badulla", serviceDistricts: ["Badulla","Nuwara Eliya"], city: "Badulla",
    
    experience: 12,
    whatsapp: "94710029688",
    facebook: "facebook.com/p024electrician",
    avatarUrl: "/uploads/seed/avatars/prov_p024.jpg",
    
    suspended: false,
    verificationStatus: "NONE",
    
    
    
    services: [{"title":"Inverter/solar wiring","price":9400,"priceType":"FIXED"},{"title":"House rewiring (per room)","price":7900,"priceType":"VISIT"}],
    photos: [{"url":"/uploads/seed/pool/electrician-a.jpg","caption":"Licensed electrical work, wiring and repairs — job in Badulla"},{"url":"/uploads/seed/pool/electrician-b.jpg","caption":"Recent electrician work, Badulla"}],
  },
  {
    id: "prov_p025", userId: "user_p025", name: "Menaka Gunasekara", email: "menaka.gunasekara25@example.com", phone: "0751000930",
    category: "plumber", headline: "Fast, tidy plumbing repairs and installations",
    bio: "Based in Ratnapura, I've been working in plumber for 15 years, covering Ratnapura and nearby areas. From leak repair to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Ratnapura", serviceDistricts: ["Ratnapura","Kalutara","Kegalle"], city: "Ratnapura",
    latitude: 6.6628, longitude: 80.3852,
    experience: 15,
    whatsapp: "94710030925",
    instagram: "instagram.com/p025plumber",
    avatarUrl: "/uploads/seed/avatars/prov_p025.jpg",
    
    suspended: false,
    verificationStatus: "NONE",
    
    
    
    services: [{"title":"Leak repair","price":2800,"priceType":"VISIT"},{"title":"Bathroom fitting installation","price":10900,"priceType":"DAILY"},{"title":"Water tank cleaning","price":7300,"priceType":"FIXED"}],
    photos: [{"url":"/uploads/seed/pool/plumber-b.jpg","caption":"Fast, tidy plumbing repairs and installations — job in Ratnapura"},{"url":"/uploads/seed/pool/plumber-c.jpg","caption":"Recent plumber work, Ratnapura"},{"url":"/uploads/seed/pool/plumber-d.jpg","caption":"On-site in Ratnapura"}],
  },
  {
    id: "prov_p026", userId: "user_p026", name: "Wasantha Kularatne", email: "wasantha.kularatne26@example.com", phone: "0761000968",
    category: "carpenter", headline: "Custom furniture and woodwork, built to last",
    bio: "Based in Kegalle, I've been working in carpenter for 18 years, covering Kegalle and nearby areas. From custom wardrobe build to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Kegalle", serviceDistricts: ["Kegalle","Ratnapura","Kandy"], city: "Kegalle",
    
    experience: 18,
    whatsapp: "94710032162",
    tiktok: "tiktok.com/p026carpenter",
    avatarUrl: "/uploads/seed/avatars/prov_p026.jpg",
    
    suspended: false,
    verificationStatus: "NONE",
    
    
    
    services: [{"title":"Door/window frame repair","price":5600,"priceType":"DAILY"},{"title":"Furniture polishing","price":8000,"priceType":"FIXED"},{"title":"Kitchen cabinet installation","price":87600,"priceType":"VISIT"},{"title":"Roof timber repair","price":12300,"priceType":"DAILY"}],
    photos: [{"url":"/uploads/seed/pool/carpenter-c.jpg","caption":"Custom furniture and woodwork, built to last — job in Kegalle"},{"url":"/uploads/seed/pool/carpenter-d.jpg","caption":"Recent carpenter work, Kegalle"}],
  },
  {
    id: "prov_p027", userId: "user_p027", name: "Champika Aziz", email: "champika.aziz27@example.com", phone: "0771001006",
    category: "mason", headline: "Quality masonry and construction work",
    bio: "Based in Colombo, I've been working in mason for 1 year, covering Colombo and nearby areas. From wall construction (per sq ft) to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Colombo", serviceDistricts: ["Colombo","Gampaha"], city: "Colombo",
    
    experience: 1,
    whatsapp: "94710033399",
    youtube: "youtube.com/p027mason",
    avatarUrl: "/uploads/seed/avatars/prov_p027.jpg",
    
    suspended: false,
    verificationStatus: "VERIFIED",
    verifiedAt: new Date("2026-04-10T09:00:00Z"),
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-04.jpg" },
    services: [{"title":"Tiling foundation work","price":20200,"priceType":"FIXED"},{"title":"Boundary wall repair","price":15600,"priceType":"VISIT"}],
    photos: [{"url":"/uploads/seed/pool/mason-d.jpg","caption":"Quality masonry and construction work — job in Colombo"},{"url":"/uploads/seed/pool/mason-a.jpg","caption":"Recent mason work, Colombo"},{"url":"/uploads/seed/pool/mason-b.jpg","caption":"On-site in Colombo"}],
  },
  {
    id: "prov_p028", userId: "user_p028", name: "Anushka Karunaratne", email: "anushka.karunaratne28@example.com", phone: "0781001044",
    category: "painter", headline: "Neat interior and exterior painting",
    bio: "Based in Negombo, I've been working in painter for 4 years, covering Gampaha and nearby areas. From interior painting (per room) to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Gampaha", serviceDistricts: ["Gampaha","Colombo","Kalutara"], city: "Negombo",
    
    experience: 4,
    whatsapp: "94710034636",
    facebook: "facebook.com/p028painter",
    avatarUrl: "/uploads/seed/avatars/prov_p028.jpg",
    
    suspended: false,
    verificationStatus: "VERIFIED",
    verifiedAt: new Date("2026-05-11T09:00:00Z"),
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-05.jpg" },
    services: [{"title":"Waterproof coating","price":23500,"priceType":"VISIT"},{"title":"Ceiling touch-up","price":6700,"priceType":"DAILY"},{"title":"Interior painting (per room)","price":10200,"priceType":"FIXED"}],
    photos: [{"url":"/uploads/seed/pool/painter-a.jpg","caption":"Neat interior and exterior painting — job in Negombo"},{"url":"/uploads/seed/pool/painter-b.jpg","caption":"Recent painter work, Gampaha"}],
  },
  {
    id: "prov_p029", userId: "user_p029", name: "Kumaran Selvam", email: "kumaran.selvam29@example.com", phone: "0791001082",
    category: "garden-designer", headline: "Tropical garden design that thrives in our climate",
    bio: "Based in Kalutara, I've been working in garden designer for 7 years, covering Kalutara and nearby areas. From full garden landscaping to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Kalutara", serviceDistricts: ["Kalutara","Colombo","Galle"], city: "Kalutara",
    
    experience: 7,
    whatsapp: "94710035873",
    instagram: "instagram.com/p029garden",
    avatarUrl: "/uploads/seed/avatars/prov_p029.jpg",
    
    suspended: false,
    verificationStatus: "VERIFIED",
    verifiedAt: new Date("2026-06-12T09:00:00Z"),
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-06.jpg" },
    services: [{"title":"Tropical planting design","price":29300,"priceType":"DAILY"},{"title":"Full garden landscaping","price":34200,"priceType":"FIXED"},{"title":"Lawn maintenance (monthly)","price":9200,"priceType":"VISIT"},{"title":"Tree pruning","price":7800,"priceType":"DAILY"}],
    photos: [{"url":"/uploads/seed/pool/garden-designer-b.jpg","caption":"Tropical garden design that thrives in our climate — job in Kalutara"},{"url":"/uploads/seed/pool/garden-designer-c.jpg","caption":"Recent garden designer work, Kalutara"},{"url":"/uploads/seed/pool/garden-designer-d.jpg","caption":"On-site in Kalutara"}],
  },
  {
    id: "prov_p030", userId: "user_p030", name: "Sivalingam Wickramasinghe", email: "sivalingam.wickramasinghe30@example.com", phone: "0701001110",
    category: "ac-repair", headline: "AC installation, servicing and repair",
    bio: "Based in Kandy, I've been working in ac repair for 10 years, covering Kandy and nearby areas. From ac gas refill + service to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Kandy", serviceDistricts: ["Kandy","Matale"], city: "Kandy",
    
    experience: 10,
    whatsapp: "94710037110",
    tiktok: "tiktok.com/p030ac",
    avatarUrl: "/uploads/seed/avatars/prov_p030.jpg",
    suspended: false,
    verificationStatus: "VERIFIED",
    verifiedAt: new Date("2026-01-13T09:00:00Z"),
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-01.jpg" },
    services: [{"title":"AC gas refill + service","price":8600,"priceType":"FIXED"},{"title":"New AC installation","price":14500,"priceType":"VISIT"}],
    photos: [{"url":"/uploads/seed/pool/ac-repair-c.jpg","caption":"AC installation, servicing and repair — job in Kandy"},{"url":"/uploads/seed/pool/ac-repair-d.jpg","caption":"Recent ac repair work, Kandy"}],
  },
  {
    id: "prov_p031", userId: "user_p031", name: "Chathurika Rathnayake", email: "chathurika.rathnayake31@example.com", phone: "0711001148",
    category: "appliance-repair", headline: "Home appliance repairs, done right",
    bio: "Based in Matale, I've been working in appliance repair for 13 years, covering Matale and nearby areas. From washing machine repair to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Matale", serviceDistricts: ["Matale","Kandy","Anuradhapura"], city: "Matale",
    latitude: 7.5075, longitude: 80.6514,
    experience: 13,
    whatsapp: "94710038347",
    youtube: "youtube.com/p031appliance",
    avatarUrl: "/uploads/seed/avatars/prov_p031.jpg",
    
    suspended: false,
    verificationStatus: "PENDING",
    
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-02.jpg" },
    services: [{"title":"Refrigerator repair","price":3700,"priceType":"VISIT"},{"title":"Microwave repair","price":3000,"priceType":"DAILY"},{"title":"Water heater repair","price":4600,"priceType":"FIXED"}],
    photos: [{"url":"/uploads/seed/pool/appliance-repair-d.jpg","caption":"Home appliance repairs, done right — job in Matale"},{"url":"/uploads/seed/pool/appliance-repair-a.jpg","caption":"Recent appliance repair work, Matale"},{"url":"/uploads/seed/pool/appliance-repair-b.jpg","caption":"On-site in Matale"}],
  },
  {
    id: "prov_p032", userId: "user_p032", name: "Sathiyaseelan Rasheed", email: "sathiyaseelan.rasheed32@example.com", phone: "0721001186",
    category: "welder", headline: "Custom metal fabrication and welding",
    bio: "Based in Nuwara Eliya, I've been working in welder for 16 years, covering Nuwara Eliya and nearby areas. From gate fabrication to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Nuwara Eliya", serviceDistricts: ["Nuwara Eliya","Kandy","Badulla"], city: "Nuwara Eliya",
    
    experience: 16,
    whatsapp: "94710039584",
    facebook: "facebook.com/p032welder",
    avatarUrl: "/uploads/seed/avatars/prov_p032.jpg",
    
    suspended: false,
    verificationStatus: "PENDING",
    
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-03.jpg" },
    services: [{"title":"Staircase railing","price":26400,"priceType":"DAILY"},{"title":"Structural steel welding","price":9500,"priceType":"FIXED"},{"title":"Repair welding (per job)","price":5000,"priceType":"VISIT"},{"title":"Gate fabrication","price":15900,"priceType":"DAILY"}],
    photos: [{"url":"/uploads/seed/pool/welder-a.jpg","caption":"Custom metal fabrication and welding — job in Nuwara Eliya"},{"url":"/uploads/seed/pool/welder-b.jpg","caption":"Recent welder work, Nuwara Eliya"}],
  },
  {
    id: "prov_p033", userId: "user_p033", name: "Kannan Ratnayake", email: "kannan.ratnayake33@example.com", phone: "0731001224",
    category: "roofer", headline: "Roofing repairs and installation specialist",
    bio: "Based in Galle, I've been working in roofer for 19 years, covering Galle and nearby areas. From roof sheet replacement to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Galle", serviceDistricts: ["Galle","Matara"], city: "Galle",
    latitude: 6.0035, longitude: 80.1860,
    experience: 19,
    whatsapp: "94710040821",
    instagram: "instagram.com/p033roofer",
    avatarUrl: "/uploads/seed/avatars/prov_p033.jpg",
    
    suspended: false,
    verificationStatus: "REJECTED",
    
    rejectionReason: "NIC photo was blurry — please re-upload a clear photo of both sides.",
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-04.jpg" },
    services: [{"title":"Full re-roofing (per sq ft)","price":800,"priceType":"FIXED"},{"title":"Roof inspection","price":3200,"priceType":"VISIT"}],
    photos: [{"url":"/uploads/seed/pool/roofer-b.jpg","caption":"Roofing repairs and installation specialist — job in Galle"},{"url":"/uploads/seed/pool/roofer-c.jpg","caption":"Recent roofer work, Galle"},{"url":"/uploads/seed/pool/roofer-d.jpg","caption":"On-site in Galle"}],
  },
  {
    id: "prov_p034", userId: "user_p034", name: "Nirmala Kumar", email: "nirmala.kumar34@example.com", phone: "0741001262",
    category: "tile-layer", headline: "Precise tiling for floors, walls and bathrooms",
    bio: "Based in Matara, I've been working in tile layer for 2 years, covering Matara and nearby areas. From floor tiling (per sq ft) to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Matara", serviceDistricts: ["Matara","Galle","Hambantota"], city: "Matara",
    
    experience: 2,
    whatsapp: "94710042058",
    tiktok: "tiktok.com/p034tile",
    avatarUrl: "/uploads/seed/avatars/prov_p034.jpg",
    
    suspended: false,
    verificationStatus: "NONE",
    
    
    
    services: [{"title":"Outdoor tiling","price":400,"priceType":"VISIT"},{"title":"Floor tiling (per sq ft)","price":450,"priceType":"DAILY"},{"title":"Bathroom tiling","price":15000,"priceType":"FIXED"}],
    photos: [{"url":"/uploads/seed/pool/tile-layer-c.jpg","caption":"Precise tiling for floors, walls and bathrooms — job in Matara"},{"url":"/uploads/seed/pool/tile-layer-d.jpg","caption":"Recent tile layer work, Matara"}],
  },
  {
    id: "prov_p035", userId: "user_p035", name: "Fazil Jayawardena", email: "fazil.jayawardena35@example.com", phone: "0751001300",
    category: "cctv-security", headline: "CCTV and home security system installation",
    bio: "Based in Tangalle, I've been working in cctv security for 5 years, covering Hambantota and nearby areas. From 4-camera cctv installation to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Hambantota", serviceDistricts: ["Hambantota","Matara","Monaragala"], city: "Tangalle",
    latitude: 6.0941, longitude: 81.0975,
    experience: 5,
    whatsapp: "94710043295",
    youtube: "youtube.com/p035cctv",
    avatarUrl: "/uploads/seed/avatars/prov_p035.jpg",
    
    suspended: false,
    verificationStatus: "NONE",
    
    
    
    services: [{"title":"4-camera CCTV installation","price":54300,"priceType":"DAILY"},{"title":"CCTV system maintenance","price":10900,"priceType":"FIXED"},{"title":"Alarm system installation","price":23900,"priceType":"VISIT"},{"title":"Camera repair/replacement","price":6500,"priceType":"DAILY"}],
    photos: [{"url":"/uploads/seed/pool/cctv-security-d.jpg","caption":"CCTV and home security system installation — job in Tangalle"},{"url":"/uploads/seed/pool/cctv-security-a.jpg","caption":"Recent cctv security work, Hambantota"},{"url":"/uploads/seed/pool/cctv-security-b.jpg","caption":"On-site in Tangalle"}],
  },
  {
    id: "prov_p036", userId: "user_p036", name: "Naseer Amarasinghe", email: "naseer.amarasinghe36@example.com", phone: "0761001338",
    category: "pest-control", headline: "Safe, effective pest control for home and office",
    bio: "Based in Jaffna, I've been working in pest control for 8 years, covering Jaffna and nearby areas. From full house pest treatment to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Jaffna", serviceDistricts: ["Jaffna","Kilinochchi"], city: "Jaffna",
    
    experience: 8,
    whatsapp: "94710044532",
    facebook: "facebook.com/p036pest",
    avatarUrl: "/uploads/seed/avatars/prov_p036.jpg",
    
    suspended: false,
    verificationStatus: "NONE",
    
    
    
    services: [{"title":"Termite treatment","price":27600,"priceType":"FIXED"},{"title":"Mosquito fogging","price":6900,"priceType":"VISIT"}],
    photos: [{"url":"/uploads/seed/pool/pest-control-a.jpg","caption":"Safe, effective pest control for home and office — job in Jaffna"},{"url":"/uploads/seed/pool/pest-control-b.jpg","caption":"Recent pest control work, Jaffna"}],
  },
  {
    id: "prov_p037", userId: "user_p037", name: "Rajeswari Hameed", email: "rajeswari.hameed37@example.com", phone: "0771001376",
    category: "cleaning", headline: "Thorough home and office cleaning services",
    bio: "Based in Batticaloa, I've been working in cleaning for 11 years, covering Batticaloa and nearby areas. From full house deep cleaning to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Batticaloa", serviceDistricts: ["Batticaloa","Ampara","Polonnaruwa"], city: "Batticaloa",
    latitude: 7.7002, longitude: 81.6854,
    experience: 11,
    whatsapp: "94710045769",
    instagram: "instagram.com/p037cleaning",
    avatarUrl: "/uploads/seed/avatars/prov_p037.jpg",
    
    suspended: false,
    verificationStatus: "VERIFIED",
    verifiedAt: new Date("2026-02-11T09:00:00Z"),
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-05.jpg" },
    services: [{"title":"Post-construction cleaning","price":26600,"priceType":"VISIT"},{"title":"Office cleaning (monthly)","price":11500,"priceType":"DAILY"},{"title":"Window cleaning","price":4600,"priceType":"FIXED"}],
    photos: [{"url":"/uploads/seed/pool/cleaning-b.jpg","caption":"Thorough home and office cleaning services — job in Batticaloa"},{"url":"/uploads/seed/pool/cleaning-c.jpg","caption":"Recent cleaning work, Batticaloa"},{"url":"/uploads/seed/pool/cleaning-d.jpg","caption":"On-site in Batticaloa"}],
  },
  {
    id: "prov_p038", userId: "user_p038", name: "Mohamed Rizwan Dissanayake", email: "mohamed.rizwan.dissanayake38@example.com", phone: "0781001414",
    category: "movers", headline: "Careful, on-time moving and relocation",
    bio: "Based in Trincomalee, I've been working in movers for 14 years, covering Trincomalee and nearby areas. From full house moving (van + 2 staff) to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Trincomalee", serviceDistricts: ["Trincomalee","Polonnaruwa","Anuradhapura"], city: "Trincomalee",
    
    experience: 14,
    whatsapp: "94710047006",
    tiktok: "tiktok.com/p038movers",
    avatarUrl: "/uploads/seed/avatars/prov_p038.jpg",
    
    suspended: false,
    verificationStatus: "VERIFIED",
    verifiedAt: new Date("2026-03-12T09:00:00Z"),
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-06.jpg" },
    services: [{"title":"Packing service","price":11600,"priceType":"DAILY"},{"title":"Long-distance moving","price":43800,"priceType":"FIXED"},{"title":"Full house moving (van + 2 staff)","price":28000,"priceType":"VISIT"},{"title":"Office relocation","price":61500,"priceType":"DAILY"}],
    photos: [{"url":"/uploads/seed/pool/movers-c.jpg","caption":"Careful, on-time moving and relocation — job in Trincomalee"},{"url":"/uploads/seed/pool/movers-d.jpg","caption":"Recent movers work, Trincomalee"}],
  },
  {
    id: "prov_p039", userId: "user_p039", name: "Suresh Abeysekera", email: "suresh.abeysekera39@example.com", phone: "0791001452",
    category: "mechanic", headline: "Reliable vehicle repairs and servicing",
    bio: "Based in Kalmunai, I've been working in mechanic for 17 years, covering Ampara and nearby areas. From engine diagnostics to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Ampara", serviceDistricts: ["Ampara","Batticaloa"], city: "Kalmunai",
    latitude: 7.3075, longitude: 81.6817,
    experience: 17,
    whatsapp: "94710048243",
    youtube: "youtube.com/p039mechanic",
    avatarUrl: "/uploads/seed/avatars/prov_p039.jpg",
    
    suspended: false,
    verificationStatus: "VERIFIED",
    verifiedAt: new Date("2026-04-13T09:00:00Z"),
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-01.jpg" },
    services: [{"title":"Battery replacement","price":6400,"priceType":"FIXED"},{"title":"Engine diagnostics","price":4600,"priceType":"VISIT"}],
    photos: [{"url":"/uploads/seed/pool/mechanic-d.jpg","caption":"Reliable vehicle repairs and servicing — job in Kalmunai"},{"url":"/uploads/seed/pool/mechanic-a.jpg","caption":"Recent mechanic work, Ampara"},{"url":"/uploads/seed/pool/mechanic-b.jpg","caption":"On-site in Kalmunai"}],
  },
  {
    id: "prov_p040", userId: "user_p040", name: "Dilani Fernando", email: "dilani.fernando40@example.com", phone: "0701001480",
    category: "electrician", headline: "Licensed electrical work, wiring and repairs",
    bio: "Based in Kurunegala, I've been working in electrician for 20 years, covering Kurunegala and nearby areas. From house rewiring (per room) to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Kurunegala", serviceDistricts: ["Kurunegala","Puttalam","Anuradhapura"], city: "Kurunegala",
    
    experience: 20,
    whatsapp: "94710049480",
    facebook: "facebook.com/p040electrician",
    avatarUrl: "/uploads/seed/avatars/prov_p040.jpg",
    suspended: false,
    verificationStatus: "VERIFIED",
    verifiedAt: new Date("2026-05-14T09:00:00Z"),
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-02.jpg" },
    services: [{"title":"House rewiring (per room)","price":6400,"priceType":"VISIT"},{"title":"Circuit breaker installation","price":6500,"priceType":"DAILY"},{"title":"Ceiling fan installation","price":4000,"priceType":"FIXED"}],
    photos: [{"url":"/uploads/seed/pool/electrician-a.jpg","caption":"Licensed electrical work, wiring and repairs — job in Kurunegala"},{"url":"/uploads/seed/pool/electrician-b.jpg","caption":"Recent electrician work, Kurunegala"}],
  },
  {
    id: "prov_p041", userId: "user_p041", name: "Kasun Herath", email: "kasun.herath41@example.com", phone: "0711001518",
    category: "plumber", headline: "Fast, tidy plumbing repairs and installations",
    bio: "Based in Chilaw, I've been working in plumber for 3 years, covering Puttalam and nearby areas. From leak repair to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Puttalam", serviceDistricts: ["Puttalam","Kurunegala","Gampaha"], city: "Chilaw",
    latitude: 8.0662, longitude: 79.8493,
    experience: 3,
    whatsapp: "94710050717",
    instagram: "instagram.com/p041plumber",
    avatarUrl: "/uploads/seed/avatars/prov_p041.jpg",
    
    suspended: false,
    verificationStatus: "PENDING",
    
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-03.jpg" },
    services: [{"title":"Bathroom fitting installation","price":9000,"priceType":"DAILY"},{"title":"Water tank cleaning","price":6500,"priceType":"FIXED"},{"title":"Pipe replacement (per meter)","price":3300,"priceType":"VISIT"},{"title":"Blocked drain clearing","price":3200,"priceType":"DAILY"}],
    photos: [{"url":"/uploads/seed/pool/plumber-b.jpg","caption":"Fast, tidy plumbing repairs and installations — job in Chilaw"},{"url":"/uploads/seed/pool/plumber-c.jpg","caption":"Recent plumber work, Puttalam"},{"url":"/uploads/seed/pool/plumber-d.jpg","caption":"On-site in Chilaw"}],
  },
  {
    id: "prov_p042", userId: "user_p042", name: "Dinesh Ismail", email: "dinesh.ismail42@example.com", phone: "0721001556",
    category: "carpenter", headline: "Custom furniture and woodwork, built to last",
    bio: "Based in Anuradhapura, I've been working in carpenter for 6 years, covering Anuradhapura and nearby areas. From custom wardrobe build to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Anuradhapura", serviceDistricts: ["Anuradhapura","Polonnaruwa"], city: "Anuradhapura",
    
    experience: 6,
    whatsapp: "94710051954",
    tiktok: "tiktok.com/p042carpenter",
    avatarUrl: "/uploads/seed/avatars/prov_p042.jpg",
    
    suspended: false,
    verificationStatus: "PENDING",
    
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-04.jpg" },
    services: [{"title":"Furniture polishing","price":6800,"priceType":"FIXED"},{"title":"Kitchen cabinet installation","price":75000,"priceType":"VISIT"}],
    photos: [{"url":"/uploads/seed/pool/carpenter-c.jpg","caption":"Custom furniture and woodwork, built to last — job in Anuradhapura"},{"url":"/uploads/seed/pool/carpenter-d.jpg","caption":"Recent carpenter work, Anuradhapura"}],
  },
  {
    id: "prov_p043", userId: "user_p043", name: "Sewwandi Bandara", email: "sewwandi.bandara43@example.com", phone: "0731001594",
    category: "mason", headline: "Quality masonry and construction work",
    bio: "Based in Polonnaruwa, I've been working in mason for 9 years, covering Polonnaruwa and nearby areas. From wall construction (per sq ft) to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Polonnaruwa", serviceDistricts: ["Polonnaruwa","Anuradhapura","Batticaloa"], city: "Polonnaruwa",
    latitude: 7.9903, longitude: 81.0538,
    experience: 9,
    whatsapp: "94710053191",
    youtube: "youtube.com/p043mason",
    avatarUrl: "/uploads/seed/avatars/prov_p043.jpg",
    
    suspended: false,
    verificationStatus: "REJECTED",
    
    rejectionReason: "NIC photo was blurry — please re-upload a clear photo of both sides.",
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-05.jpg" },
    services: [{"title":"Boundary wall repair","price":13100,"priceType":"VISIT"},{"title":"Concrete flooring","price":1700,"priceType":"DAILY"},{"title":"Wall construction (per sq ft)","price":900,"priceType":"FIXED"}],
    photos: [{"url":"/uploads/seed/pool/mason-d.jpg","caption":"Quality masonry and construction work — job in Polonnaruwa"},{"url":"/uploads/seed/pool/mason-a.jpg","caption":"Recent mason work, Polonnaruwa"},{"url":"/uploads/seed/pool/mason-b.jpg","caption":"On-site in Polonnaruwa"}],
  },
  {
    id: "prov_p044", userId: "user_p044", name: "Priyantha Mendis", email: "priyantha.mendis44@example.com", phone: "0741001632",
    category: "painter", headline: "Neat interior and exterior painting",
    bio: "Based in Badulla, I've been working in painter for 12 years, covering Badulla and nearby areas. From interior painting (per room) to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Badulla", serviceDistricts: ["Badulla","Nuwara Eliya","Monaragala"], city: "Badulla",
    
    experience: 12,
    whatsapp: "94710054428",
    facebook: "facebook.com/p044painter",
    avatarUrl: "/uploads/seed/avatars/prov_p044.jpg",
    
    suspended: false,
    verificationStatus: "NONE",
    
    
    
    services: [{"title":"Ceiling touch-up","price":5900,"priceType":"DAILY"},{"title":"Interior painting (per room)","price":8100,"priceType":"FIXED"},{"title":"Exterior house painting","price":38500,"priceType":"VISIT"},{"title":"Wood varnishing","price":9100,"priceType":"DAILY"}],
    photos: [{"url":"/uploads/seed/pool/painter-a.jpg","caption":"Neat interior and exterior painting — job in Badulla"},{"url":"/uploads/seed/pool/painter-b.jpg","caption":"Recent painter work, Badulla"}],
  },
  {
    id: "prov_p045", userId: "user_p045", name: "Saman Silva", email: "saman.silva45@example.com", phone: "0751001670",
    category: "garden-designer", headline: "Tropical garden design that thrives in our climate",
    bio: "Based in Ratnapura, I've been working in garden designer for 15 years, covering Ratnapura and nearby areas. From full garden landscaping to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Ratnapura", serviceDistricts: ["Ratnapura","Kalutara"], city: "Ratnapura",
    latitude: 6.6428, longitude: 80.3712,
    experience: 15,
    whatsapp: "94710055665",
    instagram: "instagram.com/p045garden",
    avatarUrl: "/uploads/seed/avatars/prov_p045.jpg",
    
    suspended: true,
    verificationStatus: "NONE",
    
    
    
    services: [{"title":"Full garden landscaping","price":89500,"priceType":"FIXED"},{"title":"Lawn maintenance (monthly)","price":7300,"priceType":"VISIT"}],
    photos: [{"url":"/uploads/seed/pool/garden-designer-b.jpg","caption":"Tropical garden design that thrives in our climate — job in Ratnapura"},{"url":"/uploads/seed/pool/garden-designer-c.jpg","caption":"Recent garden designer work, Ratnapura"},{"url":"/uploads/seed/pool/garden-designer-d.jpg","caption":"On-site in Ratnapura"}],
  },
  {
    id: "prov_p046", userId: "user_p046", name: "Shanika Senanayake", email: "shanika.senanayake46@example.com", phone: "0761001708",
    category: "ac-repair", headline: "AC installation, servicing and repair",
    bio: "Based in Kegalle, I've been working in ac repair for 18 years, covering Kegalle and nearby areas. From ac gas refill + service to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Kegalle", serviceDistricts: ["Kegalle","Ratnapura","Kandy"], city: "Kegalle",
    
    experience: 18,
    whatsapp: "94710056902",
    tiktok: "tiktok.com/p046ac",
    avatarUrl: "/uploads/seed/avatars/prov_p046.jpg",
    
    suspended: true,
    verificationStatus: "NONE",
    
    
    
    services: [{"title":"New AC installation","price":24700,"priceType":"VISIT"},{"title":"AC deep cleaning","price":4800,"priceType":"DAILY"},{"title":"Compressor repair","price":14700,"priceType":"FIXED"}],
    photos: [{"url":"/uploads/seed/pool/ac-repair-c.jpg","caption":"AC installation, servicing and repair — job in Kegalle"},{"url":"/uploads/seed/pool/ac-repair-d.jpg","caption":"Recent ac repair work, Kegalle"}],
  },
  {
    id: "prov_p047", userId: "user_p047", name: "Chamara Nadesan", email: "chamara.nadesan47@example.com", phone: "0771001746",
    category: "appliance-repair", headline: "Home appliance repairs, done right",
    bio: "Based in Colombo, I've been working in appliance repair for 1 year, covering Colombo and nearby areas. From washing machine repair to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Colombo", serviceDistricts: ["Colombo","Gampaha","Kalutara"], city: "Colombo",
    
    experience: 1,
    whatsapp: "94710058139",
    youtube: "youtube.com/p047appliance",
    avatarUrl: "/uploads/seed/avatars/prov_p047.jpg",
    
    suspended: false,
    verificationStatus: "VERIFIED",
    verifiedAt: new Date("2026-06-12T09:00:00Z"),
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-06.jpg" },
    services: [{"title":"Microwave repair","price":2300,"priceType":"DAILY"},{"title":"Water heater repair","price":3900,"priceType":"FIXED"},{"title":"Mixer/blender repair","price":2400,"priceType":"VISIT"},{"title":"Washing machine repair","price":7900,"priceType":"DAILY"}],
    photos: [{"url":"/uploads/seed/pool/appliance-repair-d.jpg","caption":"Home appliance repairs, done right — job in Colombo"},{"url":"/uploads/seed/pool/appliance-repair-a.jpg","caption":"Recent appliance repair work, Colombo"},{"url":"/uploads/seed/pool/appliance-repair-b.jpg","caption":"On-site in Colombo"}],
  },
  {
    id: "prov_p048", userId: "user_p048", name: "Lasantha Rajapaksa", email: "lasantha.rajapaksa48@example.com", phone: "0781001784",
    category: "welder", headline: "Custom metal fabrication and welding",
    bio: "Based in Negombo, I've been working in welder for 4 years, covering Gampaha and nearby areas. From gate fabrication to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Gampaha", serviceDistricts: ["Gampaha","Colombo"], city: "Negombo",
    
    experience: 4,
    whatsapp: "94710059376",
    facebook: "facebook.com/p048welder",
    avatarUrl: "/uploads/seed/avatars/prov_p048.jpg",
    
    suspended: false,
    verificationStatus: "VERIFIED",
    verifiedAt: new Date("2026-01-13T09:00:00Z"),
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-01.jpg" },
    services: [{"title":"Structural steel welding","price":7400,"priceType":"FIXED"},{"title":"Repair welding (per job)","price":4100,"priceType":"VISIT"}],
    photos: [{"url":"/uploads/seed/pool/welder-a.jpg","caption":"Custom metal fabrication and welding — job in Negombo"},{"url":"/uploads/seed/pool/welder-b.jpg","caption":"Recent welder work, Gampaha"}],
  },
  {
    id: "prov_p049", userId: "user_p049", name: "Sanduni Wijesinghe", email: "sanduni.wijesinghe49@example.com", phone: "0791001822",
    category: "roofer", headline: "Roofing repairs and installation specialist",
    bio: "Based in Kalutara, I've been working in roofer for 7 years, covering Kalutara and nearby areas. From roof sheet replacement to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Kalutara", serviceDistricts: ["Kalutara","Colombo","Galle"], city: "Kalutara",
    
    experience: 7,
    whatsapp: "94710060613",
    instagram: "instagram.com/p049roofer",
    avatarUrl: "/uploads/seed/avatars/prov_p049.jpg",
    
    suspended: false,
    verificationStatus: "VERIFIED",
    verifiedAt: new Date("2026-02-14T09:00:00Z"),
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-02.jpg" },
    services: [{"title":"Roof inspection","price":2700,"priceType":"VISIT"},{"title":"Roof sheet replacement","price":38100,"priceType":"DAILY"},{"title":"Roof leak repair","price":14500,"priceType":"FIXED"}],
    photos: [{"url":"/uploads/seed/pool/roofer-b.jpg","caption":"Roofing repairs and installation specialist — job in Kalutara"},{"url":"/uploads/seed/pool/roofer-c.jpg","caption":"Recent roofer work, Kalutara"},{"url":"/uploads/seed/pool/roofer-d.jpg","caption":"On-site in Kalutara"}],
  },
  {
    id: "prov_p050", userId: "user_p050", name: "Isuru Perera", email: "isuru.perera50@example.com", phone: "0701001850",
    category: "tile-layer", headline: "Precise tiling for floors, walls and bathrooms",
    bio: "Based in Kandy, I've been working in tile layer for 10 years, covering Kandy and nearby areas. From floor tiling (per sq ft) to full jobs, I keep customers informed on price and timeline before starting any work.",
    district: "Kandy", serviceDistricts: ["Kandy","Matale","Nuwara Eliya"], city: "Kandy",
    
    experience: 10,
    whatsapp: "94710061850",
    tiktok: "tiktok.com/p050tile",
    avatarUrl: "/uploads/seed/avatars/prov_p050.jpg",
    suspended: false,
    verificationStatus: "VERIFIED",
    verifiedAt: new Date("2026-03-15T09:00:00Z"),
    
    verificationDoc: { kind: "NIC", url: "/uploads/seed/verification/nic-pool-03.jpg" },
    services: [{"title":"Floor tiling (per sq ft)","price":450,"priceType":"DAILY"},{"title":"Bathroom tiling","price":34800,"priceType":"FIXED"},{"title":"Tile regrouting","price":5600,"priceType":"VISIT"},{"title":"Kitchen backsplash tiling","price":12400,"priceType":"DAILY"}],
    photos: [{"url":"/uploads/seed/pool/tile-layer-c.jpg","caption":"Precise tiling for floors, walls and bathrooms — job in Kandy"},{"url":"/uploads/seed/pool/tile-layer-d.jpg","caption":"Recent tile layer work, Kandy"}],
  },
];


// Mirrors identity-service's customer users (id/name/phone/email only) so
// this service can attribute inquiries without a cross-service lookup at
// seed time. Keep in sync with identity-service/prisma/seed.js.
const CUSTOMERS_FOR_INQUIRIES = [
  { id: "user_dilani", name: "Dilani Rajapaksa", phone: "0711111111", email: "dilani@example.com" },
  { id: "user_ashan", name: "Ashan Mendis", phone: "0722222222", email: "ashan@example.com" },
  { id: "user_tharindu", name: "Tharindu Gunawardena", phone: "0733333333", email: "tharindu@example.com" },
  { id: "user_c004", name: "Nadeeka Weerasinghe", phone: "0741018652", email: "nadeeka.weerasinghe4@example.com" },
  { id: "user_c005", name: "Nalin Thevar", phone: "0751018690", email: "nalin.thevar5@example.com" },
  { id: "user_c006", name: "Sanduni Gunasekara", phone: "0761018728", email: "sanduni.gunasekara6@example.com" },
  { id: "user_c007", name: "Dinesh Kularatne", phone: "0771018766", email: "dinesh.kularatne7@example.com" },
  { id: "user_c008", name: "Chathurika Aziz", phone: "0781018804", email: "chathurika.aziz8@example.com" },
  { id: "user_c009", name: "Priyantha Karunaratne", phone: "0791018842", email: "priyantha.karunaratne9@example.com" },
  { id: "user_c010", name: "Yasodha Selvam", phone: "0701018870", email: "yasodha.selvam10@example.com" },
  { id: "user_c011", name: "Ruwan Wickramasinghe", phone: "0711018908", email: "ruwan.wickramasinghe11@example.com" },
  { id: "user_c012", name: "Vasanthi Rathnayake", phone: "0721018946", email: "vasanthi.rathnayake12@example.com" },
  { id: "user_c013", name: "Lasantha Rasheed", phone: "0731018984", email: "lasantha.rasheed13@example.com" },
  { id: "user_c014", name: "Rajeswari Ratnayake", phone: "0741019022", email: "rajeswari.ratnayake14@example.com" },
  { id: "user_c015", name: "Isuru Kumar", phone: "0751019060", email: "isuru.kumar15@example.com" },
  { id: "user_c016", name: "Farhana Jayawardena", phone: "0761019098", email: "farhana.jayawardena16@example.com" },
  { id: "user_c017", name: "Tharaka Amarasinghe", phone: "0771019136", email: "tharaka.amarasinghe17@example.com" },
  { id: "user_c018", name: "Kavindya Hameed", phone: "0781019174", email: "kavindya.hameed18@example.com" },
  { id: "user_c019", name: "Gayan Dissanayake", phone: "0791019212", email: "gayan.dissanayake19@example.com" },
  { id: "user_c020", name: "Sewwandi Abeysekera", phone: "0701019240", email: "sewwandi.abeysekera20@example.com" },
  { id: "user_c021", name: "Amila Fernando", phone: "0711019278", email: "amila.fernando21@example.com" },
  { id: "user_c022", name: "Menaka Herath", phone: "0721019316", email: "menaka.herath22@example.com" },
  { id: "user_c023", name: "Prasanna Ismail", phone: "0731019354", email: "prasanna.ismail23@example.com" },
  { id: "user_c024", name: "Nadeeka Bandara", phone: "0741019392", email: "nadeeka.bandara24@example.com" },
  { id: "user_c025", name: "Wasantha Mendis", phone: "0751019430", email: "wasantha.mendis25@example.com" },
  { id: "user_c026", name: "Sanduni Silva", phone: "0761019468", email: "sanduni.silva26@example.com" },
  { id: "user_c027", name: "Ranjan Senanayake", phone: "0771019506", email: "ranjan.senanayake27@example.com" },
  { id: "user_c028", name: "Chathurika Nadesan", phone: "0781019544", email: "chathurika.nadesan28@example.com" },
  { id: "user_c029", name: "Sivalingam Rajapaksa", phone: "0791019582", email: "sivalingam.rajapaksa29@example.com" },
  { id: "user_c030", name: "Yasodha Wijesinghe", phone: "0701019610", email: "yasodha.wijesinghe30@example.com" },
];

async function main() {
  // Categories are real taxonomy (mechanic, electrician, ...), not demo data —
  // upserts are idempotent and never wipe admin edits, so this part is safe
  // (and needed) to run in production too.
  for (const cat of CATEGORIES) {
    await db.category.upsert({
      where: { slug: cat.slug },
      update: cat,
      create: cat,
    });
  }

  // Everything below this point is DUMMY demo data (fake providers, services,
  // photos, inquiries) — it must never reach a production database. Same
  // guard as identity-service.
  if (process.env.NODE_ENV === "production" && process.env.SEED_DEMO_DATA !== "true") {
    console.error(
      "Refusing to seed demo providers with NODE_ENV=production " +
        "(set SEED_DEMO_DATA=true to override deliberately). " +
        "Categories above were still upserted — they're real taxonomy, not demo data."
    );
    process.exit(1);
  }

  await db.inquiry.deleteMany();
  await db.verificationDocument.deleteMany();
  await db.workPhoto.deleteMany();
  await db.service.deleteMany();
  await db.provider.deleteMany();

  for (const [pi, p] of PROVIDERS.entries()) {
    await db.provider.create({
      data: {
        id: p.id,
        userId: p.userId,
        contactName: p.name,
        contactEmail: p.email,
        contactPhone: p.phone,
        category: p.category,
        headline: p.headline,
        bio: p.bio,
        district: p.district,
        // Multi-district service area (#502): the full served set; falls back
        // to just the home district for single-district providers.
        serviceDistricts: p.serviceDistricts ?? [p.district],
        city: p.city,
        // Optional map pin (#48); most demo providers stay unpinned so both
        // states show up in dev.
        latitude: p.latitude ?? null,
        longitude: p.longitude ?? null,
        experience: p.experience,
        whatsapp: p.whatsapp ?? null,
        facebook: p.facebook ?? null,
        instagram: p.instagram ?? null,
        tiktok: p.tiktok ?? null,
        youtube: p.youtube ?? null,
        avatarUrl: p.avatarUrl ?? null,
        services: { create: p.services },
        photos: {
          create: p.photos.map((caption, i) => ({
            url: `/uploads/seed/p${pi}-${i}.jpg`,
            caption,
          })),
        },
      },
    });
  }

  // NEW_PROVIDERS (#632 seed-data expansion) carries verification statuses,
  // suspensions and cover photos the original 6 demo providers don't need.
  for (const p of NEW_PROVIDERS) {
    await db.provider.create({
      data: {
        id: p.id,
        userId: p.userId,
        contactName: p.name,
        contactEmail: p.email,
        contactPhone: p.phone,
        category: p.category,
        headline: p.headline,
        bio: p.bio,
        district: p.district,
        serviceDistricts: p.serviceDistricts ?? [p.district],
        city: p.city,
        latitude: p.latitude ?? null,
        longitude: p.longitude ?? null,
        experience: p.experience,
        whatsapp: p.whatsapp ?? null,
        facebook: p.facebook ?? null,
        instagram: p.instagram ?? null,
        tiktok: p.tiktok ?? null,
        youtube: p.youtube ?? null,
        avatarUrl: p.avatarUrl,
        coverPhoto: p.coverPhoto ?? null,
        suspended: p.suspended,
        verificationStatus: p.verificationStatus,
        verifiedAt: p.verifiedAt ?? null,
        rejectionReason: p.rejectionReason ?? null,
        services: { create: p.services },
        photos: { create: p.photos },
        ...(p.verificationDoc
          ? { verificationDocs: { create: [p.verificationDoc] } }
          : {}),
      },
    });
  }

  // Inquiries: the original demo inquiry plus a broader spread across the
  // new providers/customers, mixing NEW and RESPONDED states so both the
  // provider inbox and the "answered" thread view are demoable.
  const INQUIRY_MESSAGES = [
    "Hi, I saw your profile — are you available this week?",
    "Can you give me a rough quote before I book?",
    "What areas do you cover exactly? I'm a bit outside your listed district.",
    "Do you have any availability this weekend?",
    "I need this done urgently, can you come tomorrow?",
    "Is the price on your listing negotiable for a bigger job?",
    "Can you share some more photos of past work?",
    "Do you provide a warranty on the work?",
  ];
  const RESPONSE_MESSAGES = [
    "Yes, I'm free — I'll message you to arrange a time.",
    "Happy to help, I'll send a quote once I see the job details.",
    "That's within my service area, no problem.",
  ];
  const inquiryCustomers = CUSTOMERS_FOR_INQUIRIES;

  await db.inquiry.create({
    data: {
      providerId: "prov_nuwan",
      userId: "user_dilani",
      name: "Dilani Rajapaksa",
      phone: "0711111111",
      email: "dilani@example.com",
      message:
        "Hi Nuwan, my Vitz is making a grinding noise when braking. Can I bring it in this weekend?",
    },
  });

  let inquiryCount = 1;
  const inquiryTargets = [...PROVIDERS, ...NEW_PROVIDERS].filter((p) => p.id !== "prov_nuwan");
  for (let i = 0; i < 24; i++) {
    const provider = inquiryTargets[i % inquiryTargets.length];
    const customer = inquiryCustomers[i % inquiryCustomers.length];
    const responded = i % 3 !== 0; // ~2/3 of these get a response
    await db.inquiry.create({
      data: {
        providerId: provider.id,
        userId: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        message: INQUIRY_MESSAGES[i % INQUIRY_MESSAGES.length],
        status: responded ? "RESPONDED" : "NEW",
        respondedAt: responded ? new Date(`2026-0${1 + (i % 6)}-1${(i % 9) + 1}T10:00:00Z`) : null,
        messages: responded
          ? {
              create: [
                {
                  sender: "PROVIDER",
                  body: RESPONSE_MESSAGES[i % RESPONSE_MESSAGES.length],
                },
              ],
            }
          : undefined,
      },
    });
    inquiryCount++;
  }

  const providerCount = PROVIDERS.length + NEW_PROVIDERS.length;
  console.log(
    `Seeded ${CATEGORIES.length} categories and ${providerCount} providers with services, photos and ${inquiryCount} inquiries.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
