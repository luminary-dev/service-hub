// One-shot production admin bootstrap: creates (or promotes) an ADMIN account
// without shipping seeded credentials. Non-interactive so it works in a
// container or CI:
//
//   ADMIN_EMAIL=you@baas.lk ADMIN_PASSWORD='...' npm run create-admin
//   npm run create-admin -- --email you@baas.lk --password '...' [--name "Ops"]
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const bcrypt = require("bcryptjs");
const { parseArgs } = require("node:util");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    password: { type: "string" },
    name: { type: "string" },
  },
});

const email = values.email ?? process.env.ADMIN_EMAIL;
const password = values.password ?? process.env.ADMIN_PASSWORD;
const name = values.name ?? process.env.ADMIN_NAME ?? "Administrator";

if (!email || !password) {
  console.error(
    "Usage: ADMIN_EMAIL=you@baas.lk ADMIN_PASSWORD='...' npm run create-admin\n" +
      "   or: npm run create-admin -- --email you@baas.lk --password '...' [--name \"Ops\"]"
  );
  process.exit(1);
}
// Same rule as registration/change-password (lib/register-schema.ts).
if (password.length < 6 || password.length > 100) {
  console.error("Password must be between 6 and 100 characters.");
  process.exit(1);
}

async function main() {
  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    // Explicit bootstrap intent: promote AND take over the credential, and
    // bump sessionVersion so any session under the old password dies.
    await db.user.update({
      where: { id: existing.id },
      data: { role: "ADMIN", passwordHash, sessionVersion: { increment: 1 } },
    });
    console.log(`Promoted ${email} to ADMIN and reset the password.`);
  } else {
    await db.user.create({
      data: { email, name, passwordHash, role: "ADMIN", emailVerified: new Date() },
    });
    console.log(`Created ADMIN account ${email}.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
