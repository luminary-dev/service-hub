const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const db = new PrismaClient();

function xmlEscape(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function placeholderSvg(rawLabel, from, to, emoji) {
  const label = xmlEscape(rawLabel);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="800" height="600" fill="url(#g)"/>
  <text x="400" y="290" font-size="120" text-anchor="middle">${emoji}</text>
  <text x="400" y="400" font-family="sans-serif" font-size="34" font-weight="600" fill="rgba(255,255,255,.92)" text-anchor="middle">${label}</text>
</svg>`;
}

const PROVIDERS = [
  {
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
    photos: [
      ["Engine bay after full service", "#0f766e", "#134e4a", "🔧"],
      ["Brake overhaul on a Prius", "#155e75", "#164e63", "🚗"],
    ],
  },
  {
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
    photos: [
      ["New distribution board install", "#b45309", "#92400e", "⚡"],
      ["Rewiring a two-storey house", "#a16207", "#854d0e", "🏠"],
    ],
  },
  {
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
      ["Courtyard garden in Kandy", "#15803d", "#166534", "🌿"],
      ["Water feature & rockery", "#0d9488", "#115e59", "⛲"],
      ["Rooftop herb garden", "#4d7c0f", "#3f6212", "🌱"],
    ],
  },
  {
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
    photos: [["Pump house installation", "#1d4ed8", "#1e40af", "🚿"]],
  },
  {
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
    photos: [["Split unit install in Dehiwala", "#0369a1", "#075985", "❄️"]],
  },
  {
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
    photos: [
      ["Teak pantry in Galle Fort home", "#92400e", "#78350f", "🪚"],
      ["Mahogany dining set", "#7c2d12", "#601b06", "🪑"],
    ],
  },
];

const CUSTOMERS = [
  { name: "Dilani Rajapaksa", email: "dilani@example.com", phone: "0711111111" },
  { name: "Ashan Mendis", email: "ashan@example.com", phone: "0722222222" },
  { name: "Tharindu Gunawardena", email: "tharindu@example.com", phone: "0733333333" },
];

const REVIEWS = [
  { provider: 0, customer: 0, rating: 5, comment: "Fixed my Aqua's brake issue the same day and charged exactly what he quoted. Very honest mechanic." },
  { provider: 0, customer: 1, rating: 4, comment: "Good service, explained everything clearly. Workshop gets busy so book ahead." },
  { provider: 1, customer: 0, rating: 5, comment: "Rewired our entire house in Kadawatha. Neat work, proper earthing, passed inspection first time." },
  { provider: 2, customer: 2, rating: 5, comment: "Kumari transformed our bare backyard into a beautiful tropical garden. Worth every rupee." },
  { provider: 2, customer: 1, rating: 5, comment: "Very knowledgeable about native plants. The garden survived the dry season perfectly." },
  { provider: 3, customer: 2, rating: 4, comment: "Came within two hours for a burst pipe. Tidy and fast." },
  { provider: 5, customer: 0, rating: 5, comment: "The pantry cupboards are stunning. Real craftsmanship you rarely see these days." },
];

async function main() {
  const uploadsDir = path.join(process.cwd(), "public", "uploads", "seed");
  fs.mkdirSync(uploadsDir, { recursive: true });

  await db.inquiry.deleteMany();
  await db.review.deleteMany();
  await db.workPhoto.deleteMany();
  await db.service.deleteMany();
  await db.provider.deleteMany();
  await db.user.deleteMany();

  const passwordHash = await bcrypt.hash("password123", 10);

  const providerRecords = [];
  for (const [pi, p] of PROVIDERS.entries()) {
    const photoData = p.photos.map(([caption, from, to, emoji], i) => {
      const filename = `seed/p${pi}-${i}.svg`;
      fs.writeFileSync(
        path.join(process.cwd(), "public", "uploads", filename),
        placeholderSvg(caption, from, to, emoji)
      );
      return { url: `/uploads/${filename}`, caption };
    });

    const user = await db.user.create({
      data: {
        email: p.email,
        passwordHash,
        name: p.name,
        phone: p.phone,
        role: "PROVIDER",
        provider: {
          create: {
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
            photos: { create: photoData },
          },
        },
      },
      include: { provider: true },
    });
    providerRecords.push(user.provider);
  }

  const customerRecords = [];
  for (const c of CUSTOMERS) {
    const user = await db.user.create({
      data: { ...c, passwordHash, role: "CUSTOMER" },
    });
    customerRecords.push(user);
  }

  for (const r of REVIEWS) {
    await db.review.create({
      data: {
        providerId: providerRecords[r.provider].id,
        userId: customerRecords[r.customer].id,
        rating: r.rating,
        comment: r.comment,
      },
    });
  }

  await db.inquiry.create({
    data: {
      providerId: providerRecords[0].id,
      name: "Dilani Rajapaksa",
      phone: "0711111111",
      email: "dilani@example.com",
      message: "Hi Nuwan, my Vitz is making a grinding noise when braking. Can I bring it in this weekend?",
      userId: customerRecords[0].id,
    },
  });

  console.log(
    `Seeded ${PROVIDERS.length} providers, ${CUSTOMERS.length} customers, ${REVIEWS.length} reviews.`
  );
  console.log("All accounts use password: password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
