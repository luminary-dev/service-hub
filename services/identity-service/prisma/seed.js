// identity-service seed. IDs are DETERMINISTIC so the other services' seeds
// (provider, review, job) can reference these users without cross-DB lookups.
// Same demo accounts and password123 as the monolith seed.
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const bcrypt = require("bcryptjs");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const PROVIDER_USERS = [
  { id: "user_nuwan", name: "Nuwan Perera", email: "nuwan@example.com", phone: "0771234501" },
  { id: "user_sampath", name: "Sampath Jayasuriya", email: "sampath@example.com", phone: "0712345602" },
  { id: "user_kumari", name: "Kumari Wickramasinghe", email: "kumari@example.com", phone: "0763456703" },
  { id: "user_roshan", name: "Roshan Fernando", email: "roshan@example.com", phone: "0754567804" },
  { id: "user_rizwan", name: "Mohamed Rizwan", email: "rizwan@example.com", phone: "0705678905" },
  { id: "user_chaminda", name: "Chaminda Silva", email: "chaminda@example.com", phone: "0776789006" },
];

const CUSTOMERS = [
  { id: "user_dilani", name: "Dilani Rajapaksa", email: "dilani@example.com", phone: "0711111111" },
  { id: "user_ashan", name: "Ashan Mendis", email: "ashan@example.com", phone: "0722222222" },
  { id: "user_tharindu", name: "Tharindu Gunawardena", email: "tharindu@example.com", phone: "0733333333" },
];

const ADMIN = {
  id: "user_admin",
  name: "Baas Admin",
  email: "admin@baas.lk",
  phone: "0770000000",
};

async function main() {
  await db.passwordResetToken.deleteMany();
  await db.emailVerificationToken.deleteMany();
  await db.favorite.deleteMany();
  await db.user.deleteMany();

  const passwordHash = await bcrypt.hash("password123", 10);

  for (const u of PROVIDER_USERS) {
    await db.user.create({ data: { ...u, passwordHash, role: "PROVIDER" } });
  }

  for (const c of CUSTOMERS) {
    await db.user.create({ data: { ...c, passwordHash, role: "CUSTOMER" } });
  }

  await db.user.create({ data: { ...ADMIN, passwordHash, role: "ADMIN" } });

  console.log(
    `Seeded ${PROVIDER_USERS.length} provider users, ${CUSTOMERS.length} customers, 1 admin (admin@baas.lk).`
  );
  console.log("All accounts use password: password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
