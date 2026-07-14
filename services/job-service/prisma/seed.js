// Job requests and responses for the seed-data expansion (#632) — the
// monolith had no job seed data, but a demo stack with an empty job board
// undersells the feature. customerId/providerId reference identity-service
// (user_*) and provider-service (prov_*) seeds directly, no cross-DB lookup.
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const JOBS = [
  { id: "job_001", customerId: "user_dilani", category: "mechanic", district: "Colombo", title: "Need a mechanic to look at a strange engine noise", description: "My car makes a grinding noise when I brake. Would like someone experienced to take a look and give an honest quote.", budget: null, status: "OPEN", hidden: false },
  { id: "job_002", customerId: "user_c006", category: "electrician", district: "Kandy", title: "Looking for an electrician to fix a tripping circuit", description: "One of the circuits in my house keeps tripping the breaker. Needs someone licensed to diagnose and fix it safely.", budget: 16000, status: "OPEN", hidden: false },
  { id: "job_003", customerId: "user_c011", category: "plumber", district: "Galle", title: "Need a plumber for a leaking kitchen pipe", description: "There's a slow leak under my kitchen sink that's starting to damage the cabinet. Need it fixed properly, not a quick patch.", budget: 29000, status: "OPEN", hidden: false },
  { id: "job_004", customerId: "user_c016", category: "carpenter", district: "Jaffna", title: "Want a custom bookshelf built for the living room", description: "Looking for a carpenter to build a custom bookshelf to fit an alcove in my living room. Can provide rough measurements.", budget: null, status: "OPEN", hidden: false },
  { id: "job_005", customerId: "user_c021", category: "mason", district: "Ampara", title: "Need masonry work for a small boundary wall", description: "Small section of my boundary wall collapsed after the rains. Need it rebuilt to match the existing wall.", budget: 15000, status: "OPEN", hidden: false },
  { id: "job_006", customerId: "user_c026", category: "painter", district: "Anuradhapura", title: "Looking for a painter for a 3-bedroom house", description: "Need the interior of a 3-bedroom house repainted. Walls are in decent condition, just need a fresh coat.", budget: 28000, status: "OPEN", hidden: false },
  { id: "job_007", customerId: "user_dilani", category: "garden-designer", district: "Ratnapura", title: "Want to redesign a small overgrown backyard", description: "My backyard is overgrown and I'd like a simple, low-maintenance tropical garden redesign.", budget: null, status: "OPEN", hidden: false },
  { id: "job_008", customerId: "user_c006", category: "ac-repair", district: "Gampaha", title: "AC not cooling properly, need a technician", description: "My split AC unit is running but not cooling the room anymore. Might need a gas refill or could be something else.", budget: 14000, status: "CLOSED", hidden: false },
  { id: "job_009", customerId: "user_c011", category: "appliance-repair", district: "Matale", title: "Washing machine stopped spinning, needs repair", description: "My washing machine fills with water but the drum doesn't spin. Would like a diagnosis and repair quote.", budget: 27000, status: "CLOSED", hidden: false },
  { id: "job_010", customerId: "user_c016", category: "welder", district: "Matara", title: "Need a metal gate fabricated and installed", description: "Need a metal gate fabricated for my driveway entrance, roughly 3m wide, plus installation.", budget: null, status: "CLOSED", hidden: false },
  { id: "job_011", customerId: "user_c021", category: "roofer", district: "Batticaloa", title: "Roof leaking during rain, need urgent repair", description: "Noticed water coming through the ceiling during the last heavy rain. Need someone to find and fix the leak.", budget: 13000, status: "OPEN", hidden: false },
  { id: "job_012", customerId: "user_c026", category: "tile-layer", district: "Kurunegala", title: "Need bathroom floor retiled", description: "Bathroom floor tiles are cracked in a few places and I'd like the whole floor redone.", budget: 26000, status: "OPEN", hidden: false },
  { id: "job_013", customerId: "user_dilani", category: "cctv-security", district: "Polonnaruwa", title: "Want to install CCTV cameras at home", description: "Want a basic 4-camera CCTV setup covering the front gate, garden and back entrance.", budget: null, status: "OPEN", hidden: false },
  { id: "job_014", customerId: "user_c006", category: "pest-control", district: "Kegalle", title: "Need pest control for a termite problem", description: "Found termite damage on a wooden door frame and want a full inspection and treatment.", budget: 12000, status: "OPEN", hidden: false },
  { id: "job_015", customerId: "user_c011", category: "cleaning", district: "Kalutara", title: "Looking for a deep clean before moving in", description: "Moving into a new house next month and want a full deep clean done before we move furniture in.", budget: 25000, status: "OPEN", hidden: false },
  { id: "job_016", customerId: "user_c016", category: "movers", district: "Nuwara Eliya", title: "Need help moving house within the same city", description: "Moving from a 2-bedroom apartment to a house across town, need help with furniture and boxes.", budget: null, status: "OPEN", hidden: false },
  { id: "job_017", customerId: "user_c021", category: "mechanic", district: "Hambantota", title: "Need a mechanic to look at a strange engine noise", description: "My car makes a grinding noise when I brake. Would like someone experienced to take a look and give an honest quote.", budget: 11000, status: "OPEN", hidden: false },
  { id: "job_018", customerId: "user_c026", category: "electrician", district: "Trincomalee", title: "Looking for an electrician to fix a tripping circuit", description: "One of the circuits in my house keeps tripping the breaker. Needs someone licensed to diagnose and fix it safely.", budget: 24000, status: "CLOSED", hidden: false },
  { id: "job_019", customerId: "user_dilani", category: "plumber", district: "Puttalam", title: "Need a plumber for a leaking kitchen pipe", description: "There's a slow leak under my kitchen sink that's starting to damage the cabinet. Need it fixed properly, not a quick patch.", budget: null, status: "CLOSED", hidden: false },
  { id: "job_020", customerId: "user_c006", category: "carpenter", district: "Badulla", title: "Want a custom bookshelf built for the living room", description: "Looking for a carpenter to build a custom bookshelf to fit an alcove in my living room. Can provide rough measurements.", budget: 10000, status: "CLOSED", hidden: true },
  { id: "job_021", customerId: "user_c011", category: "mason", district: "Colombo", title: "Need masonry work for a small boundary wall", description: "Small section of my boundary wall collapsed after the rains. Need it rebuilt to match the existing wall.", budget: 23000, status: "OPEN", hidden: false },
  { id: "job_022", customerId: "user_c016", category: "painter", district: "Kandy", title: "Looking for a painter for a 3-bedroom house", description: "Need the interior of a 3-bedroom house repainted. Walls are in decent condition, just need a fresh coat.", budget: null, status: "OPEN", hidden: false },
  { id: "job_023", customerId: "user_c021", category: "garden-designer", district: "Galle", title: "Want to redesign a small overgrown backyard", description: "My backyard is overgrown and I'd like a simple, low-maintenance tropical garden redesign.", budget: 9000, status: "OPEN", hidden: false },
  { id: "job_024", customerId: "user_c026", category: "ac-repair", district: "Jaffna", title: "AC not cooling properly, need a technician", description: "My split AC unit is running but not cooling the room anymore. Might need a gas refill or could be something else.", budget: 22000, status: "OPEN", hidden: false },
  { id: "job_025", customerId: "user_dilani", category: "appliance-repair", district: "Ampara", title: "Washing machine stopped spinning, needs repair", description: "My washing machine fills with water but the drum doesn't spin. Would like a diagnosis and repair quote.", budget: null, status: "OPEN", hidden: false },
  { id: "job_026", customerId: "user_c006", category: "welder", district: "Anuradhapura", title: "Need a metal gate fabricated and installed", description: "Need a metal gate fabricated for my driveway entrance, roughly 3m wide, plus installation.", budget: 8000, status: "OPEN", hidden: false },
  { id: "job_027", customerId: "user_c011", category: "roofer", district: "Ratnapura", title: "Roof leaking during rain, need urgent repair", description: "Noticed water coming through the ceiling during the last heavy rain. Need someone to find and fix the leak.", budget: 21000, status: "OPEN", hidden: false },
  { id: "job_028", customerId: "user_c016", category: "tile-layer", district: "Gampaha", title: "Need bathroom floor retiled", description: "Bathroom floor tiles are cracked in a few places and I'd like the whole floor redone.", budget: null, status: "CLOSED", hidden: false },
  { id: "job_029", customerId: "user_c021", category: "cctv-security", district: "Matale", title: "Want to install CCTV cameras at home", description: "Want a basic 4-camera CCTV setup covering the front gate, garden and back entrance.", budget: 7000, status: "CLOSED", hidden: false },
  { id: "job_030", customerId: "user_c026", category: "pest-control", district: "Matara", title: "Need pest control for a termite problem", description: "Found termite damage on a wooden door frame and want a full inspection and treatment.", budget: 20000, status: "CLOSED", hidden: false },
  { id: "job_031", customerId: "user_dilani", category: "cleaning", district: "Batticaloa", title: "Looking for a deep clean before moving in", description: "Moving into a new house next month and want a full deep clean done before we move furniture in.", budget: null, status: "OPEN", hidden: false },
  { id: "job_032", customerId: "user_c006", category: "movers", district: "Kurunegala", title: "Need help moving house within the same city", description: "Moving from a 2-bedroom apartment to a house across town, need help with furniture and boxes.", budget: 6000, status: "OPEN", hidden: false },
  { id: "job_033", customerId: "user_c011", category: "mechanic", district: "Polonnaruwa", title: "Need a mechanic to look at a strange engine noise", description: "My car makes a grinding noise when I brake. Would like someone experienced to take a look and give an honest quote.", budget: 19000, status: "OPEN", hidden: false },
  { id: "job_034", customerId: "user_c016", category: "electrician", district: "Kegalle", title: "Looking for an electrician to fix a tripping circuit", description: "One of the circuits in my house keeps tripping the breaker. Needs someone licensed to diagnose and fix it safely.", budget: null, status: "OPEN", hidden: false },
  { id: "job_035", customerId: "user_c021", category: "plumber", district: "Kalutara", title: "Need a plumber for a leaking kitchen pipe", description: "There's a slow leak under my kitchen sink that's starting to damage the cabinet. Need it fixed properly, not a quick patch.", budget: 5000, status: "OPEN", hidden: false },
  { id: "job_036", customerId: "user_c026", category: "carpenter", district: "Nuwara Eliya", title: "Want a custom bookshelf built for the living room", description: "Looking for a carpenter to build a custom bookshelf to fit an alcove in my living room. Can provide rough measurements.", budget: 18000, status: "OPEN", hidden: false },
  { id: "job_037", customerId: "user_dilani", category: "mason", district: "Hambantota", title: "Need masonry work for a small boundary wall", description: "Small section of my boundary wall collapsed after the rains. Need it rebuilt to match the existing wall.", budget: null, status: "OPEN", hidden: false },
  { id: "job_038", customerId: "user_c006", category: "painter", district: "Trincomalee", title: "Looking for a painter for a 3-bedroom house", description: "Need the interior of a 3-bedroom house repainted. Walls are in decent condition, just need a fresh coat.", budget: 4000, status: "CLOSED", hidden: false },
  { id: "job_039", customerId: "user_c011", category: "garden-designer", district: "Puttalam", title: "Want to redesign a small overgrown backyard", description: "My backyard is overgrown and I'd like a simple, low-maintenance tropical garden redesign.", budget: 17000, status: "CLOSED", hidden: false },
  { id: "job_040", customerId: "user_c016", category: "ac-repair", district: "Badulla", title: "AC not cooling properly, need a technician", description: "My split AC unit is running but not cooling the room anymore. Might need a gas refill or could be something else.", budget: null, status: "CLOSED", hidden: true },
];

const RESPONSES = [
  { jobRequestId: "job_001", providerId: "prov_nuwan", message: "I can take this on. Available this week — happy to give a firm quote after seeing photos." },
  { jobRequestId: "job_002", providerId: "prov_p008", message: "This sounds like a job I can help with. I've done similar work recently in the area." },
  { jobRequestId: "job_002", providerId: "prov_p024", message: "I'm based nearby and can come take a look within the next couple of days." },
  { jobRequestId: "job_003", providerId: "prov_p025", message: "I'm based nearby and can come take a look within the next couple of days." },
  { jobRequestId: "job_003", providerId: "prov_p041", message: "Sure, I can help with this. Let me know a good time for a site visit." },
  { jobRequestId: "job_003", providerId: "prov_roshan", message: "I can take this on. Available this week — happy to give a firm quote after seeing photos." },
  { jobRequestId: "job_004", providerId: "prov_p042", message: "Sure, I can help with this. Let me know a good time for a site visit." },
  { jobRequestId: "job_005", providerId: "prov_p027", message: "I can take this on. Available this week — happy to give a firm quote after seeing photos." },
  { jobRequestId: "job_005", providerId: "prov_p043", message: "This sounds like a job I can help with. I've done similar work recently in the area." },
  { jobRequestId: "job_006", providerId: "prov_p044", message: "This sounds like a job I can help with. I've done similar work recently in the area." },
  { jobRequestId: "job_006", providerId: "prov_p012", message: "I'm based nearby and can come take a look within the next couple of days." },
  { jobRequestId: "job_006", providerId: "prov_p028", message: "Sure, I can help with this. Let me know a good time for a site visit." },
  { jobRequestId: "job_007", providerId: "prov_p029", message: "I'm based nearby and can come take a look within the next couple of days." },
  { jobRequestId: "job_008", providerId: "prov_p046", message: "Sure, I can help with this. Let me know a good time for a site visit." },
  { jobRequestId: "job_008", providerId: "prov_rizwan", message: "I can take this on. Available this week — happy to give a firm quote after seeing photos." },
  { jobRequestId: "job_009", providerId: "prov_p047", message: "I can take this on. Available this week — happy to give a firm quote after seeing photos." },
  { jobRequestId: "job_009", providerId: "prov_p015", message: "This sounds like a job I can help with. I've done similar work recently in the area." },
  { jobRequestId: "job_009", providerId: "prov_p031", message: "I'm based nearby and can come take a look within the next couple of days." },
  { jobRequestId: "job_010", providerId: "prov_p016", message: "This sounds like a job I can help with. I've done similar work recently in the area." },
  { jobRequestId: "job_011", providerId: "prov_p033", message: "I'm based nearby and can come take a look within the next couple of days." },
  { jobRequestId: "job_011", providerId: "prov_p049", message: "Sure, I can help with this. Let me know a good time for a site visit." },
  { jobRequestId: "job_012", providerId: "prov_p050", message: "Sure, I can help with this. Let me know a good time for a site visit." },
  { jobRequestId: "job_012", providerId: "prov_p018", message: "I can take this on. Available this week — happy to give a firm quote after seeing photos." },
  { jobRequestId: "job_012", providerId: "prov_p034", message: "This sounds like a job I can help with. I've done similar work recently in the area." },
  { jobRequestId: "job_013", providerId: "prov_p019", message: "I can take this on. Available this week — happy to give a firm quote after seeing photos." },
  { jobRequestId: "job_014", providerId: "prov_p036", message: "This sounds like a job I can help with. I've done similar work recently in the area." },
  { jobRequestId: "job_014", providerId: "prov_p020", message: "I'm based nearby and can come take a look within the next couple of days." },
  { jobRequestId: "job_015", providerId: "prov_p021", message: "I'm based nearby and can come take a look within the next couple of days." },
  { jobRequestId: "job_015", providerId: "prov_p037", message: "Sure, I can help with this. Let me know a good time for a site visit." },
  { jobRequestId: "job_016", providerId: "prov_p038", message: "Sure, I can help with this. Let me know a good time for a site visit." },
  { jobRequestId: "job_017", providerId: "prov_nuwan", message: "I can take this on. Available this week — happy to give a firm quote after seeing photos." },
  { jobRequestId: "job_017", providerId: "prov_p007", message: "This sounds like a job I can help with. I've done similar work recently in the area." },
  { jobRequestId: "job_018", providerId: "prov_p008", message: "This sounds like a job I can help with. I've done similar work recently in the area." },
  { jobRequestId: "job_018", providerId: "prov_p024", message: "I'm based nearby and can come take a look within the next couple of days." },
  { jobRequestId: "job_018", providerId: "prov_p040", message: "Sure, I can help with this. Let me know a good time for a site visit." },
  { jobRequestId: "job_019", providerId: "prov_p025", message: "I'm based nearby and can come take a look within the next couple of days." },
  { jobRequestId: "job_020", providerId: "prov_p042", message: "Sure, I can help with this. Let me know a good time for a site visit." },
  { jobRequestId: "job_020", providerId: "prov_chaminda", message: "I can take this on. Available this week — happy to give a firm quote after seeing photos." },
  { jobRequestId: "job_021", providerId: "prov_p043", message: "I can take this on. Available this week — happy to give a firm quote after seeing photos." },
  { jobRequestId: "job_021", providerId: "prov_p011", message: "This sounds like a job I can help with. I've done similar work recently in the area." },
  { jobRequestId: "job_021", providerId: "prov_p027", message: "I'm based nearby and can come take a look within the next couple of days." },
  { jobRequestId: "job_022", providerId: "prov_p012", message: "This sounds like a job I can help with. I've done similar work recently in the area." },
  { jobRequestId: "job_023", providerId: "prov_p029", message: "I'm based nearby and can come take a look within the next couple of days." },
  { jobRequestId: "job_023", providerId: "prov_p045", message: "Sure, I can help with this. Let me know a good time for a site visit." },
  { jobRequestId: "job_024", providerId: "prov_p046", message: "Sure, I can help with this. Let me know a good time for a site visit." },
  { jobRequestId: "job_024", providerId: "prov_rizwan", message: "I can take this on. Available this week — happy to give a firm quote after seeing photos." },
  { jobRequestId: "job_024", providerId: "prov_p014", message: "This sounds like a job I can help with. I've done similar work recently in the area." },
  { jobRequestId: "job_025", providerId: "prov_p015", message: "I can take this on. Available this week — happy to give a firm quote after seeing photos." },
  { jobRequestId: "job_026", providerId: "prov_p032", message: "This sounds like a job I can help with. I've done similar work recently in the area." },
  { jobRequestId: "job_026", providerId: "prov_p048", message: "I'm based nearby and can come take a look within the next couple of days." },
  { jobRequestId: "job_027", providerId: "prov_p049", message: "I'm based nearby and can come take a look within the next couple of days." },
  { jobRequestId: "job_027", providerId: "prov_p017", message: "Sure, I can help with this. Let me know a good time for a site visit." },
  { jobRequestId: "job_027", providerId: "prov_p033", message: "I can take this on. Available this week — happy to give a firm quote after seeing photos." },
  { jobRequestId: "job_028", providerId: "prov_p018", message: "Sure, I can help with this. Let me know a good time for a site visit." },
  { jobRequestId: "job_029", providerId: "prov_p019", message: "I can take this on. Available this week — happy to give a firm quote after seeing photos." },
  { jobRequestId: "job_029", providerId: "prov_p035", message: "This sounds like a job I can help with. I've done similar work recently in the area." },
  { jobRequestId: "job_030", providerId: "prov_p036", message: "This sounds like a job I can help with. I've done similar work recently in the area." },
  { jobRequestId: "job_030", providerId: "prov_p020", message: "I'm based nearby and can come take a look within the next couple of days." },
  { jobRequestId: "job_031", providerId: "prov_p021", message: "I'm based nearby and can come take a look within the next couple of days." },
  { jobRequestId: "job_032", providerId: "prov_p038", message: "Sure, I can help with this. Let me know a good time for a site visit." },
  { jobRequestId: "job_032", providerId: "prov_p022", message: "I can take this on. Available this week — happy to give a firm quote after seeing photos." },
  { jobRequestId: "job_033", providerId: "prov_nuwan", message: "I can take this on. Available this week — happy to give a firm quote after seeing photos." },
  { jobRequestId: "job_033", providerId: "prov_p007", message: "This sounds like a job I can help with. I've done similar work recently in the area." },
  { jobRequestId: "job_033", providerId: "prov_p023", message: "I'm based nearby and can come take a look within the next couple of days." },
  { jobRequestId: "job_034", providerId: "prov_p008", message: "This sounds like a job I can help with. I've done similar work recently in the area." },
  { jobRequestId: "job_035", providerId: "prov_p025", message: "I'm based nearby and can come take a look within the next couple of days." },
  { jobRequestId: "job_035", providerId: "prov_p041", message: "Sure, I can help with this. Let me know a good time for a site visit." },
  { jobRequestId: "job_036", providerId: "prov_p042", message: "Sure, I can help with this. Let me know a good time for a site visit." },
  { jobRequestId: "job_036", providerId: "prov_chaminda", message: "I can take this on. Available this week — happy to give a firm quote after seeing photos." },
  { jobRequestId: "job_036", providerId: "prov_p010", message: "This sounds like a job I can help with. I've done similar work recently in the area." },
  { jobRequestId: "job_037", providerId: "prov_p011", message: "I can take this on. Available this week — happy to give a firm quote after seeing photos." },
  { jobRequestId: "job_038", providerId: "prov_p028", message: "This sounds like a job I can help with. I've done similar work recently in the area." },
  { jobRequestId: "job_038", providerId: "prov_p044", message: "I'm based nearby and can come take a look within the next couple of days." },
  { jobRequestId: "job_039", providerId: "prov_p029", message: "I'm based nearby and can come take a look within the next couple of days." },
  { jobRequestId: "job_039", providerId: "prov_p045", message: "Sure, I can help with this. Let me know a good time for a site visit." },
  { jobRequestId: "job_039", providerId: "prov_kumari", message: "I can take this on. Available this week — happy to give a firm quote after seeing photos." },
  { jobRequestId: "job_040", providerId: "prov_p046", message: "Sure, I can help with this. Let me know a good time for a site visit." },
];

async function main() {
  // This is DUMMY demo data (fake job requests and responses) — it must
  // never reach a production database. Same guard as identity-service.
  if (process.env.NODE_ENV === "production" && process.env.SEED_DEMO_DATA !== "true") {
    console.error(
      "Refusing to seed demo jobs with NODE_ENV=production " +
        "(set SEED_DEMO_DATA=true to override deliberately)."
    );
    process.exitCode = 1;
    return;
  }

  await db.jobResponse.deleteMany();
  await db.jobRequest.deleteMany();

  for (const j of JOBS) {
    const { hidden, ...jobData } = j;
    await db.jobRequest.create({
      data: { ...jobData, hiddenAt: hidden ? new Date("2026-05-01T12:00:00Z") : null },
    });
  }

  for (const r of RESPONSES) {
    await db.jobResponse.create({ data: r });
  }

  console.log(`Seeded ${JOBS.length} job requests and ${RESPONSES.length} responses.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
