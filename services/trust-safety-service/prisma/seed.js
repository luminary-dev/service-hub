// No demo seed data — reports and audit rows are created by real flows (or
// backfilled from the source services); just reset the tables so repeated
// `db:seed` runs start from a clean slate.
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  // This "seed" only wipes tables, so the same guard identity-service uses for
  // demo accounts protects real report/audit data from an accidental prod run.
  if (process.env.NODE_ENV === "production" && process.env.SEED_DEMO_DATA !== "true") {
    console.error(
      "Refusing to reset trust-safety tables with NODE_ENV=production " +
        "(set SEED_DEMO_DATA=true to override deliberately)."
    );
    process.exitCode = 1;
    return;
  }
  await db.report.deleteMany();
  await db.adminAuditLog.deleteMany();
  console.log("trust-safety-service: no seed data");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
