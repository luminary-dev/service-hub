// identity-service seed. IDs are DETERMINISTIC so the other services' seeds
// (provider, review, job) can reference these users without cross-DB lookups.
// Same demo accounts and password123 as the monolith seed.
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const bcrypt = require("bcryptjs");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const PROVIDER_USERS = [
  { id: "user_nuwan", name: "Nuwan Perera", email: "nuwan@example.com", phone: "0771234501", avatarUrl: "/uploads/seed/avatars/prov_nuwan.jpg" },
  { id: "user_sampath", name: "Sampath Jayasuriya", email: "sampath@example.com", phone: "0712345602", avatarUrl: "/uploads/seed/avatars/prov_sampath.jpg" },
  { id: "user_kumari", name: "Kumari Wickramasinghe", email: "kumari@example.com", phone: "0763456703", avatarUrl: "/uploads/seed/avatars/prov_kumari.jpg" },
  { id: "user_roshan", name: "Roshan Fernando", email: "roshan@example.com", phone: "0754567804", avatarUrl: "/uploads/seed/avatars/prov_roshan.jpg" },
  { id: "user_rizwan", name: "Mohamed Rizwan", email: "rizwan@example.com", phone: "0705678905", avatarUrl: "/uploads/seed/avatars/prov_rizwan.jpg" },
  { id: "user_chaminda", name: "Chaminda Silva", email: "chaminda@example.com", phone: "0776789006", avatarUrl: "/uploads/seed/avatars/prov_chaminda.jpg" },
];

// 44 more provider users spread across all 16 categories and ~20 districts —
// ids/avatars line up 1:1 with provider-service's NEW_PROVIDERS (user_p### <->
// prov_p###). See #632 for the seed-data expansion this batch belongs to.
const NEW_PROVIDER_USERS = [
  { id: "user_p007", name: "Nadeeka Jayawardena", email: "nadeeka.jayawardena7@example.com", phone: "0771000266", avatarUrl: "/uploads/seed/avatars/prov_p007.jpg" },
  { id: "user_p008", name: "Dinesh Amarasinghe", email: "dinesh.amarasinghe8@example.com", phone: "0781000304", avatarUrl: "/uploads/seed/avatars/prov_p008.jpg" },
  { id: "user_p009", name: "Chathura Hameed", email: "chathura.hameed9@example.com", phone: "0791000342", avatarUrl: "/uploads/seed/avatars/prov_p009.jpg" },
  { id: "user_p010", name: "Nimali Dissanayake", email: "nimali.dissanayake10@example.com", phone: "0701000370", avatarUrl: "/uploads/seed/avatars/prov_p010.jpg" },
  { id: "user_p011", name: "Saman Abeysekera", email: "saman.abeysekera11@example.com", phone: "0711000408", avatarUrl: "/uploads/seed/avatars/prov_p011.jpg" },
  { id: "user_p012", name: "Ruwan Fernando", email: "ruwan.fernando12@example.com", phone: "0721000446", avatarUrl: "/uploads/seed/avatars/prov_p012.jpg" },
  { id: "user_p013", name: "Yasodha Herath", email: "yasodha.herath13@example.com", phone: "0731000484", avatarUrl: "/uploads/seed/avatars/prov_p013.jpg" },
  { id: "user_p014", name: "Lasantha Ismail", email: "lasantha.ismail14@example.com", phone: "0741000522", avatarUrl: "/uploads/seed/avatars/prov_p014.jpg" },
  { id: "user_p015", name: "Damith Bandara", email: "damith.bandara15@example.com", phone: "0751000560", avatarUrl: "/uploads/seed/avatars/prov_p015.jpg" },
  { id: "user_p016", name: "Selvarani Mendis", email: "selvarani.mendis16@example.com", phone: "0761000598", avatarUrl: "/uploads/seed/avatars/prov_p016.jpg" },
  { id: "user_p017", name: "Malith Silva", email: "malith.silva17@example.com", phone: "0771000636", avatarUrl: "/uploads/seed/avatars/prov_p017.jpg" },
  { id: "user_p018", name: "Tharaka Senanayake", email: "tharaka.senanayake18@example.com", phone: "0781000674", avatarUrl: "/uploads/seed/avatars/prov_p018.jpg" },
  { id: "user_p019", name: "Farhana Nadesan", email: "farhana.nadesan19@example.com", phone: "0791000712", avatarUrl: "/uploads/seed/avatars/prov_p019.jpg" },
  { id: "user_p020", name: "Gayan Rajapaksa", email: "gayan.rajapaksa20@example.com", phone: "0701000740", avatarUrl: "/uploads/seed/avatars/prov_p020.jpg" },
  { id: "user_p021", name: "Dilshan Wijesinghe", email: "dilshan.wijesinghe21@example.com", phone: "0711000778", avatarUrl: "/uploads/seed/avatars/prov_p021.jpg" },
  { id: "user_p022", name: "Hasini Perera", email: "hasini.perera22@example.com", phone: "0721000816", avatarUrl: "/uploads/seed/avatars/prov_p022.jpg" },
  { id: "user_p023", name: "Buddhika Weerasinghe", email: "buddhika.weerasinghe23@example.com", phone: "0731000854", avatarUrl: "/uploads/seed/avatars/prov_p023.jpg" },
  { id: "user_p024", name: "Prasanna Thevar", email: "prasanna.thevar24@example.com", phone: "0741000892", avatarUrl: "/uploads/seed/avatars/prov_p024.jpg" },
  { id: "user_p025", name: "Menaka Gunasekara", email: "menaka.gunasekara25@example.com", phone: "0751000930", avatarUrl: "/uploads/seed/avatars/prov_p025.jpg" },
  { id: "user_p026", name: "Wasantha Kularatne", email: "wasantha.kularatne26@example.com", phone: "0761000968", avatarUrl: "/uploads/seed/avatars/prov_p026.jpg" },
  { id: "user_p027", name: "Champika Aziz", email: "champika.aziz27@example.com", phone: "0771001006", avatarUrl: "/uploads/seed/avatars/prov_p027.jpg" },
  { id: "user_p028", name: "Anushka Karunaratne", email: "anushka.karunaratne28@example.com", phone: "0781001044", avatarUrl: "/uploads/seed/avatars/prov_p028.jpg" },
  { id: "user_p029", name: "Kumaran Selvam", email: "kumaran.selvam29@example.com", phone: "0791001082", avatarUrl: "/uploads/seed/avatars/prov_p029.jpg" },
  { id: "user_p030", name: "Sivalingam Wickramasinghe", email: "sivalingam.wickramasinghe30@example.com", phone: "0701001110", avatarUrl: "/uploads/seed/avatars/prov_p030.jpg" },
  { id: "user_p031", name: "Chathurika Rathnayake", email: "chathurika.rathnayake31@example.com", phone: "0711001148", avatarUrl: "/uploads/seed/avatars/prov_p031.jpg" },
  { id: "user_p032", name: "Sathiyaseelan Rasheed", email: "sathiyaseelan.rasheed32@example.com", phone: "0721001186", avatarUrl: "/uploads/seed/avatars/prov_p032.jpg" },
  { id: "user_p033", name: "Kannan Ratnayake", email: "kannan.ratnayake33@example.com", phone: "0731001224", avatarUrl: "/uploads/seed/avatars/prov_p033.jpg" },
  { id: "user_p034", name: "Nirmala Kumar", email: "nirmala.kumar34@example.com", phone: "0741001262", avatarUrl: "/uploads/seed/avatars/prov_p034.jpg" },
  { id: "user_p035", name: "Fazil Jayawardena", email: "fazil.jayawardena35@example.com", phone: "0751001300", avatarUrl: "/uploads/seed/avatars/prov_p035.jpg" },
  { id: "user_p036", name: "Naseer Amarasinghe", email: "naseer.amarasinghe36@example.com", phone: "0761001338", avatarUrl: "/uploads/seed/avatars/prov_p036.jpg" },
  { id: "user_p037", name: "Rajeswari Hameed", email: "rajeswari.hameed37@example.com", phone: "0771001376", avatarUrl: "/uploads/seed/avatars/prov_p037.jpg" },
  { id: "user_p038", name: "Mohamed Rizwan Dissanayake", email: "mohamed.rizwan.dissanayake38@example.com", phone: "0781001414", avatarUrl: "/uploads/seed/avatars/prov_p038.jpg" },
  { id: "user_p039", name: "Suresh Abeysekera", email: "suresh.abeysekera39@example.com", phone: "0791001452", avatarUrl: "/uploads/seed/avatars/prov_p039.jpg" },
  { id: "user_p040", name: "Dilani Fernando", email: "dilani.fernando40@example.com", phone: "0701001480", avatarUrl: "/uploads/seed/avatars/prov_p040.jpg" },
  { id: "user_p041", name: "Kasun Herath", email: "kasun.herath41@example.com", phone: "0711001518", avatarUrl: "/uploads/seed/avatars/prov_p041.jpg" },
  { id: "user_p042", name: "Dinesh Ismail", email: "dinesh.ismail42@example.com", phone: "0721001556", avatarUrl: "/uploads/seed/avatars/prov_p042.jpg" },
  { id: "user_p043", name: "Sewwandi Bandara", email: "sewwandi.bandara43@example.com", phone: "0731001594", avatarUrl: "/uploads/seed/avatars/prov_p043.jpg" },
  { id: "user_p044", name: "Priyantha Mendis", email: "priyantha.mendis44@example.com", phone: "0741001632", avatarUrl: "/uploads/seed/avatars/prov_p044.jpg" },
  { id: "user_p045", name: "Saman Silva", email: "saman.silva45@example.com", phone: "0751001670", avatarUrl: "/uploads/seed/avatars/prov_p045.jpg" },
  { id: "user_p046", name: "Shanika Senanayake", email: "shanika.senanayake46@example.com", phone: "0761001708", avatarUrl: "/uploads/seed/avatars/prov_p046.jpg" },
  { id: "user_p047", name: "Chamara Nadesan", email: "chamara.nadesan47@example.com", phone: "0771001746", avatarUrl: "/uploads/seed/avatars/prov_p047.jpg" },
  { id: "user_p048", name: "Lasantha Rajapaksa", email: "lasantha.rajapaksa48@example.com", phone: "0781001784", avatarUrl: "/uploads/seed/avatars/prov_p048.jpg" },
  { id: "user_p049", name: "Sanduni Wijesinghe", email: "sanduni.wijesinghe49@example.com", phone: "0791001822", avatarUrl: "/uploads/seed/avatars/prov_p049.jpg" },
  { id: "user_p050", name: "Isuru Perera", email: "isuru.perera50@example.com", phone: "0701001850", avatarUrl: "/uploads/seed/avatars/prov_p050.jpg" },
];

const CUSTOMERS = [
  { id: "user_dilani", name: "Dilani Rajapaksa", email: "dilani@example.com", phone: "0711111111", avatarUrl: "/uploads/seed/avatars/customer-pool-01.jpg" },
  { id: "user_ashan", name: "Ashan Mendis", email: "ashan@example.com", phone: "0722222222", avatarUrl: "/uploads/seed/avatars/customer-pool-02.jpg" },
  { id: "user_tharindu", name: "Tharindu Gunawardena", email: "tharindu@example.com", phone: "0733333333", avatarUrl: "/uploads/seed/avatars/customer-pool-03.jpg" },
];

// 27 more customers, ids user_c004..user_c030. avatarUrl cycles through a
// 10-image pool (customers are lower-visibility than providers, so photos are
// reused rather than uniquely generated per person).
const NEW_CUSTOMERS = [
  { id: "user_c004", name: "Nadeeka Weerasinghe", email: "nadeeka.weerasinghe4@example.com", phone: "0741018652", avatarUrl: "/uploads/seed/avatars/customer-pool-05.jpg" },
  { id: "user_c005", name: "Nalin Thevar", email: "nalin.thevar5@example.com", phone: "0751018690", avatarUrl: "/uploads/seed/avatars/customer-pool-06.jpg" },
  { id: "user_c006", name: "Sanduni Gunasekara", email: "sanduni.gunasekara6@example.com", phone: "0761018728", avatarUrl: "/uploads/seed/avatars/customer-pool-07.jpg" },
  { id: "user_c007", name: "Dinesh Kularatne", email: "dinesh.kularatne7@example.com", phone: "0771018766", avatarUrl: "/uploads/seed/avatars/customer-pool-08.jpg" },
  { id: "user_c008", name: "Chathurika Aziz", email: "chathurika.aziz8@example.com", phone: "0781018804", avatarUrl: "/uploads/seed/avatars/customer-pool-09.jpg" },
  { id: "user_c009", name: "Priyantha Karunaratne", email: "priyantha.karunaratne9@example.com", phone: "0791018842", avatarUrl: "/uploads/seed/avatars/customer-pool-10.jpg" },
  { id: "user_c010", name: "Yasodha Selvam", email: "yasodha.selvam10@example.com", phone: "0701018870", avatarUrl: "/uploads/seed/avatars/customer-pool-01.jpg" },
  { id: "user_c011", name: "Ruwan Wickramasinghe", email: "ruwan.wickramasinghe11@example.com", phone: "0711018908", avatarUrl: "/uploads/seed/avatars/customer-pool-02.jpg" },
  { id: "user_c012", name: "Vasanthi Rathnayake", email: "vasanthi.rathnayake12@example.com", phone: "0721018946", avatarUrl: "/uploads/seed/avatars/customer-pool-03.jpg" },
  { id: "user_c013", name: "Lasantha Rasheed", email: "lasantha.rasheed13@example.com", phone: "0731018984", avatarUrl: "/uploads/seed/avatars/customer-pool-04.jpg" },
  { id: "user_c014", name: "Rajeswari Ratnayake", email: "rajeswari.ratnayake14@example.com", phone: "0741019022", avatarUrl: "/uploads/seed/avatars/customer-pool-05.jpg" },
  { id: "user_c015", name: "Isuru Kumar", email: "isuru.kumar15@example.com", phone: "0751019060", avatarUrl: "/uploads/seed/avatars/customer-pool-06.jpg" },
  { id: "user_c016", name: "Farhana Jayawardena", email: "farhana.jayawardena16@example.com", phone: "0761019098", avatarUrl: "/uploads/seed/avatars/customer-pool-07.jpg" },
  { id: "user_c017", name: "Tharaka Amarasinghe", email: "tharaka.amarasinghe17@example.com", phone: "0771019136", avatarUrl: "/uploads/seed/avatars/customer-pool-08.jpg" },
  { id: "user_c018", name: "Kavindya Hameed", email: "kavindya.hameed18@example.com", phone: "0781019174", avatarUrl: "/uploads/seed/avatars/customer-pool-09.jpg" },
  { id: "user_c019", name: "Gayan Dissanayake", email: "gayan.dissanayake19@example.com", phone: "0791019212", avatarUrl: "/uploads/seed/avatars/customer-pool-10.jpg" },
  { id: "user_c020", name: "Sewwandi Abeysekera", email: "sewwandi.abeysekera20@example.com", phone: "0701019240", avatarUrl: "/uploads/seed/avatars/customer-pool-01.jpg" },
  { id: "user_c021", name: "Amila Fernando", email: "amila.fernando21@example.com", phone: "0711019278", avatarUrl: "/uploads/seed/avatars/customer-pool-02.jpg" },
  { id: "user_c022", name: "Menaka Herath", email: "menaka.herath22@example.com", phone: "0721019316", avatarUrl: "/uploads/seed/avatars/customer-pool-03.jpg" },
  { id: "user_c023", name: "Prasanna Ismail", email: "prasanna.ismail23@example.com", phone: "0731019354", avatarUrl: "/uploads/seed/avatars/customer-pool-04.jpg" },
  { id: "user_c024", name: "Nadeeka Bandara", email: "nadeeka.bandara24@example.com", phone: "0741019392", avatarUrl: "/uploads/seed/avatars/customer-pool-05.jpg" },
  { id: "user_c025", name: "Wasantha Mendis", email: "wasantha.mendis25@example.com", phone: "0751019430", avatarUrl: "/uploads/seed/avatars/customer-pool-06.jpg" },
  { id: "user_c026", name: "Sanduni Silva", email: "sanduni.silva26@example.com", phone: "0761019468", avatarUrl: "/uploads/seed/avatars/customer-pool-07.jpg" },
  { id: "user_c027", name: "Ranjan Senanayake", email: "ranjan.senanayake27@example.com", phone: "0771019506", avatarUrl: "/uploads/seed/avatars/customer-pool-08.jpg" },
  { id: "user_c028", name: "Chathurika Nadesan", email: "chathurika.nadesan28@example.com", phone: "0781019544", avatarUrl: "/uploads/seed/avatars/customer-pool-09.jpg" },
  { id: "user_c029", name: "Sivalingam Rajapaksa", email: "sivalingam.rajapaksa29@example.com", phone: "0791019582", avatarUrl: "/uploads/seed/avatars/customer-pool-10.jpg" },
  { id: "user_c030", name: "Yasodha Wijesinghe", email: "yasodha.wijesinghe30@example.com", phone: "0701019610", avatarUrl: "/uploads/seed/avatars/customer-pool-01.jpg" },
];

const ADMIN = {
  id: "user_admin",
  name: "Baas Admin",
  email: "admin@baas.lk",
  phone: "0770000000",
};

// One SUPPORT-tier account to demo the limited admin role (read + resolve/
// dismiss reports, nothing destructive) alongside the full ADMIN account.
const SUPPORT_USER = {
  id: "user_support_01",
  name: "Nadeesha Perera",
  email: "support@baas.lk",
  phone: "0770000001",
};

async function main() {
  // These are PUBLIC demo credentials (documented in the README) — they must
  // never reach a production database. Bootstrap real admins with
  // `npm run create-admin` instead.
  if (process.env.NODE_ENV === "production" && process.env.SEED_DEMO_DATA !== "true") {
    console.error(
      "Refusing to seed demo accounts with NODE_ENV=production " +
        "(set SEED_DEMO_DATA=true to override deliberately). " +
        "Use `npm run create-admin` to bootstrap an admin account."
    );
    process.exit(1);
  }

  await db.passwordResetToken.deleteMany();
  await db.emailVerificationToken.deleteMany();
  await db.favorite.deleteMany();
  await db.user.deleteMany();

  const passwordHash = await bcrypt.hash("password123", 10);
  // Demo accounts are seeded email-verified so gated flows (job posting #556)
  // work out of the box — there is no real inbox to click a link from.
  const emailVerified = new Date();

  for (const u of [...PROVIDER_USERS, ...NEW_PROVIDER_USERS]) {
    await db.user.create({
      data: { ...u, passwordHash, emailVerified, role: "PROVIDER" },
    });
  }

  for (const c of [...CUSTOMERS, ...NEW_CUSTOMERS]) {
    await db.user.create({
      data: { ...c, passwordHash, emailVerified, role: "CUSTOMER" },
    });
  }

  await db.user.create({
    data: { ...ADMIN, passwordHash, emailVerified, role: "ADMIN" },
  });

  await db.user.create({
    data: { ...SUPPORT_USER, passwordHash, emailVerified, role: "SUPPORT" },
  });

  const providerCount = PROVIDER_USERS.length + NEW_PROVIDER_USERS.length;
  const customerCount = CUSTOMERS.length + NEW_CUSTOMERS.length;
  console.log(
    `Seeded ${providerCount} provider users, ${customerCount} customers, 1 admin (admin@baas.lk), 1 support (support@baas.lk).`
  );
  console.log("All accounts use password: password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
