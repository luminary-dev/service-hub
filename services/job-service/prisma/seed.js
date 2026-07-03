// The monolith had no job seed data — just reset the tables so repeated
// `db:setup` runs start from a clean slate.
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  await db.jobResponse.deleteMany();
  await db.jobRequest.deleteMany();
  console.log("job-service: no seed data");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
