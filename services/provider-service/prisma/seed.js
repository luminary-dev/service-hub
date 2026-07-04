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
].map((c, i) => ({ ...c, active: true, sortOrder: (i + 1) * 10 }));

// Deterministic IDs so cross-service references line up with the
// identity-service seed (user_*) and the review/job seeds (prov_*).
// Photo URLs keep the monolith form — the seed SVGs live in the web app's
// public/uploads/seed/ directory and are served from there.
const PROVIDERS = [
  {
    id: "prov_nuwan",
    userId: "user_nuwan",
    name: "Nuwan Perera",
    email: "nuwan@example.com",
    phone: "0771234501",
    category: "mechanic",
    headline: "Honest auto repairs — Japanese & European vehicles",
    bio: "I run a small workshop in Nugegoda handling everything from routine servicing to full engine rebuilds. Specialised in Toyota, Nissan and Suzuki, with diagnostic equipment for European makes too. I always explain the problem and the price before touching a bolt.",
    district: "Colombo",
    city: "Nugegoda",
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
    userId: "user_sampath",
    name: "Sampath Jayasuriya",
    email: "sampath@example.com",
    phone: "0712345602",
    category: "electrician",
    headline: "Certified electrician for homes & small businesses",
    bio: "CEB-experienced electrician covering Gampaha and Colombo suburbs. House wiring, distribution board upgrades, fault finding, and solar PV connections. All work done to standard with proper earthing — safety first, always.",
    district: "Gampaha",
    city: "Kadawatha",
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
    userId: "user_kumari",
    name: "Kumari Wickramasinghe",
    email: "kumari@example.com",
    phone: "0763456703",
    category: "garden-designer",
    headline: "Tropical garden design that thrives in our climate",
    bio: "Landscape designer with a diploma in horticulture. I design and build home gardens, rooftop green spaces and courtyard gardens using native plants that love Sri Lankan weather. From a single flower bed to a complete garden makeover with water features.",
    district: "Kandy",
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
    userId: "user_roshan",
    name: "Roshan Fernando",
    email: "roshan@example.com",
    phone: "0754567804",
    category: "plumber",
    headline: "Fast, tidy plumbing — leaks fixed the same day",
    bio: "Plumber based in Moratuwa covering Colombo south. Leak repairs, bathroom fittings, water pump installation, and complete pipe layouts for new builds. I carry common spares in the van so most jobs finish in one visit.",
    district: "Colombo",
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
    userId: "user_rizwan",
    name: "Mohamed Rizwan",
    email: "rizwan@example.com",
    phone: "0705678905",
    category: "ac-repair",
    headline: "AC installation, servicing & gas refilling",
    bio: "Air conditioning technician serving Colombo and Kalutara. Split AC installation, chemical wash servicing, gas top-ups and compressor repairs for all major brands. Quick response for breakdowns — nobody should sweat through the night.",
    district: "Colombo",
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
    userId: "user_chaminda",
    name: "Chaminda Silva",
    email: "chaminda@example.com",
    phone: "0776789006",
    category: "carpenter",
    headline: "Custom furniture & pantry cupboards in teak and mahogany",
    bio: "Third-generation carpenter from Galle. I build pantry cupboards, wardrobes, beds and dining tables to order, and handle door/window framing for new houses. Quality timber, proper joinery, and finishes that last decades.",
    district: "Galle",
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

async function main() {
  // Upserts keep the seed idempotent without wiping admin-added categories.
  for (const cat of CATEGORIES) {
    await db.category.upsert({
      where: { slug: cat.slug },
      update: cat,
      create: cat,
    });
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
        city: p.city,
        experience: p.experience,
        whatsapp: p.whatsapp ?? null,
        facebook: p.facebook ?? null,
        instagram: p.instagram ?? null,
        tiktok: p.tiktok ?? null,
        youtube: p.youtube ?? null,
        services: { create: p.services },
        photos: {
          create: p.photos.map((caption, i) => ({
            url: `/uploads/seed/p${pi}-${i}.svg`,
            caption,
          })),
        },
      },
    });
  }

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

  console.log(
    `Seeded ${CATEGORIES.length} categories and ${PROVIDERS.length} providers with services, photos and 1 inquiry.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
