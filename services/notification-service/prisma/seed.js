// Seeds notification_db with a handful of demo notifications, using the same
// deterministic ids as the identity-service (user_*) seed so the feed lines up
// with the demo accounts without cross-DB lookups.
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

// Small denormalized payloads: the web renders the sentence from type +
// payload at read time (dummy data only — mirrors what the emitters send).
const NOTIFICATIONS = [
  {
    userId: "user_nuwan", // provider demo account
    type: "NEW_INQUIRY",
    payload: { customerName: "Dilani Rajapaksa" },
    link: "/dashboard",
  },
  {
    userId: "user_nuwan",
    type: "NEW_REVIEW",
    payload: { reviewerName: "Dilani Rajapaksa", rating: 5 },
    link: "/providers/prov_nuwan",
    readAt: new Date(),
  },
  {
    userId: "user_dilani", // customer demo account
    type: "REVIEW_RESPONSE",
    payload: { providerName: "Nuwan Perera" },
    link: "/providers/prov_nuwan",
  },
  {
    userId: "user_dilani",
    type: "SAVED_SEARCH_MATCH",
    payload: { providerName: "Kumari Wickramasinghe", district: "Gampaha" },
    link: "/providers/prov_kumari",
  },
];

async function main() {
  // Demo rows reference the PUBLIC demo accounts — they must never reach a
  // production database (same guard as the identity seed).
  if (process.env.NODE_ENV === "production" && process.env.SEED_DEMO_DATA !== "true") {
    console.error(
      "Refusing to seed demo notifications with NODE_ENV=production " +
        "(set SEED_DEMO_DATA=true to override deliberately)."
    );
    process.exit(1);
  }

  await db.notificationPreference.deleteMany();
  await db.notification.deleteMany();

  for (const n of NOTIFICATIONS) {
    await db.notification.create({ data: n });
  }

  console.log(`Seeded ${NOTIFICATIONS.length} notifications.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
