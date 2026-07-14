// Seeds notification_db with demo notifications spanning all 10 catalog
// types (#632 seed-data expansion — the original seed only covered 4), using
// the same deterministic ids as the identity-service (user_*) seed so the
// feed lines up with the demo accounts without cross-DB lookups. Payload
// shapes/link targets mirror src/lib/i18n.ts's `render` map exactly.
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const NOTIFICATIONS = [
  { userId: "user_nuwan", type: "NEW_INQUIRY", payload: {"customerName":"Dilani Rajapaksa"}, link: "/dashboard", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_sampath", type: "NEW_INQUIRY", payload: {"customerName":"Nadeeka Weerasinghe"}, link: "/dashboard" },
  { userId: "user_kumari", type: "NEW_INQUIRY", payload: {"customerName":"Dinesh Kularatne"}, link: "/dashboard" },
  { userId: "user_roshan", type: "NEW_INQUIRY", payload: {"customerName":"Yasodha Selvam"}, link: "/dashboard" },
  { userId: "user_rizwan", type: "NEW_INQUIRY", payload: {"customerName":"Lasantha Rasheed"}, link: "/dashboard", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_chaminda", type: "NEW_INQUIRY", payload: {"customerName":"Farhana Jayawardena"}, link: "/dashboard" },
  { userId: "user_p007", type: "NEW_INQUIRY", payload: {"customerName":"Gayan Dissanayake"}, link: "/dashboard" },
  { userId: "user_p008", type: "NEW_INQUIRY", payload: {"customerName":"Menaka Herath"}, link: "/dashboard" },
  { userId: "user_nuwan", type: "THREAD_REPLY", payload: {"senderName":"Dilani Rajapaksa"}, link: "/dashboard", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_c006", type: "THREAD_REPLY", payload: {"senderName":"Kumari Wickramasinghe"}, link: "/account/notifications" },
  { userId: "user_rizwan", type: "THREAD_REPLY", payload: {"senderName":"Ruwan Wickramasinghe"}, link: "/dashboard" },
  { userId: "user_c016", type: "THREAD_REPLY", payload: {"senderName":"Nadeeka Jayawardena"}, link: "/account/notifications", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_p009", type: "THREAD_REPLY", payload: {"senderName":"Amila Fernando"}, link: "/dashboard" },
  { userId: "user_c026", type: "THREAD_REPLY", payload: {"senderName":"Saman Abeysekera"}, link: "/account/notifications" },
  { userId: "user_p013", type: "THREAD_REPLY", payload: {"senderName":"Dilani Rajapaksa"}, link: "/dashboard", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_c006", type: "THREAD_REPLY", payload: {"senderName":"Damith Bandara"}, link: "/account/notifications" },
  { userId: "user_nuwan", type: "NEW_REVIEW", payload: {"reviewerName":"Dilani Rajapaksa","rating":5}, link: "/providers/prov_nuwan", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_roshan", type: "NEW_REVIEW", payload: {"reviewerName":"Chathurika Aziz","rating":5}, link: "/providers/prov_roshan" },
  { userId: "user_p007", type: "NEW_REVIEW", payload: {"reviewerName":"Isuru Kumar","rating":4}, link: "/providers/prov_p007" },
  { userId: "user_p010", type: "NEW_REVIEW", payload: {"reviewerName":"Menaka Herath","rating":5}, link: "/providers/prov_p010", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_p013", type: "NEW_REVIEW", payload: {"reviewerName":"Sivalingam Rajapaksa","rating":3}, link: "/providers/prov_p013" },
  { userId: "user_p016", type: "NEW_REVIEW", payload: {"reviewerName":"Sanduni Gunasekara","rating":4}, link: "/providers/prov_p016" },
  { userId: "user_p019", type: "NEW_REVIEW", payload: {"reviewerName":"Lasantha Rasheed","rating":5}, link: "/providers/prov_p019", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_p022", type: "NEW_REVIEW", payload: {"reviewerName":"Sewwandi Abeysekera","rating":2}, link: "/providers/prov_p022" },
  { userId: "user_dilani", type: "REVIEW_RESPONSE", payload: {"providerName":"Nuwan Perera"}, link: "/providers/prov_nuwan", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_tharindu", type: "REVIEW_RESPONSE", payload: {"providerName":"Mohamed Rizwan"}, link: "/providers/prov_rizwan" },
  { userId: "user_c005", type: "REVIEW_RESPONSE", payload: {"providerName":"Chathura Hameed"}, link: "/providers/prov_p009" },
  { userId: "user_c007", type: "REVIEW_RESPONSE", payload: {"providerName":"Yasodha Herath"}, link: "/providers/prov_p013", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_c009", type: "REVIEW_RESPONSE", payload: {"providerName":"Malith Silva"}, link: "/providers/prov_p017" },
  { userId: "user_c011", type: "REVIEW_RESPONSE", payload: {"providerName":"Dilshan Wijesinghe"}, link: "/providers/prov_p021" },
  { userId: "user_c013", type: "REVIEW_RESPONSE", payload: {"providerName":"Menaka Gunasekara"}, link: "/providers/prov_p025", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_c015", type: "REVIEW_RESPONSE", payload: {"providerName":"Kumaran Selvam"}, link: "/providers/prov_p029" },
  { userId: "user_nuwan", type: "VERIFICATION_APPROVED", payload: {}, link: "/dashboard", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_p007", type: "VERIFICATION_APPROVED", payload: {}, link: "/dashboard" },
  { userId: "user_p013", type: "VERIFICATION_APPROVED", payload: {}, link: "/dashboard", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_p019", type: "VERIFICATION_APPROVED", payload: {}, link: "/dashboard" },
  { userId: "user_p025", type: "VERIFICATION_APPROVED", payload: {}, link: "/dashboard", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_p031", type: "VERIFICATION_APPROVED", payload: {}, link: "/dashboard" },
  { userId: "user_roshan", type: "VERIFICATION_REJECTED", payload: {"reason":"NIC photo was blurry — please re-upload a clear photo of both sides."}, link: "/dashboard", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_p010", type: "VERIFICATION_REJECTED", payload: {"reason":"Document did not match the name on the account."}, link: "/dashboard" },
  { userId: "user_p016", type: "VERIFICATION_REJECTED", payload: {"reason":"NIC photo was blurry — please re-upload a clear photo of both sides."}, link: "/dashboard", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_p022", type: "VERIFICATION_REJECTED", payload: {"reason":"Document did not match the name on the account."}, link: "/dashboard" },
  { userId: "user_p028", type: "VERIFICATION_REJECTED", payload: {"reason":"NIC photo was blurry — please re-upload a clear photo of both sides."}, link: "/dashboard", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_p034", type: "VERIFICATION_REJECTED", payload: {"reason":"Document did not match the name on the account."}, link: "/dashboard" },
  { userId: "user_nuwan", type: "NEW_JOB_MATCH", payload: {"district":"Colombo","jobTitle":"Need a mechanic to look at a strange engine noise"}, link: "/jobs", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_chaminda", type: "NEW_JOB_MATCH", payload: {"district":"Gampaha","jobTitle":"Looking for an electrician to fix a tripping circuit"}, link: "/jobs" },
  { userId: "user_p011", type: "NEW_JOB_MATCH", payload: {"district":"Kalutara","jobTitle":"Need a plumber for a leaking kitchen pipe"}, link: "/jobs" },
  { userId: "user_p016", type: "NEW_JOB_MATCH", payload: {"district":"Kandy","jobTitle":"Want a custom bookshelf built for the living room"}, link: "/jobs" },
  { userId: "user_p021", type: "NEW_JOB_MATCH", payload: {"district":"Matale","jobTitle":"Need a mechanic to look at a strange engine noise"}, link: "/jobs", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_p026", type: "NEW_JOB_MATCH", payload: {"district":"Nuwara Eliya","jobTitle":"Looking for an electrician to fix a tripping circuit"}, link: "/jobs" },
  { userId: "user_p031", type: "NEW_JOB_MATCH", payload: {"district":"Galle","jobTitle":"Need a plumber for a leaking kitchen pipe"}, link: "/jobs" },
  { userId: "user_p036", type: "NEW_JOB_MATCH", payload: {"district":"Matara","jobTitle":"Want a custom bookshelf built for the living room"}, link: "/jobs" },
  { userId: "user_dilani", type: "JOB_RESPONSE", payload: {"providerName":"Nuwan Perera","jobTitle":"Need a mechanic to look at a strange engine noise"}, link: "/jobs", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_c005", type: "JOB_RESPONSE", payload: {"providerName":"Chathura Hameed","jobTitle":"Looking for an electrician to fix a tripping circuit"}, link: "/jobs" },
  { userId: "user_c009", type: "JOB_RESPONSE", payload: {"providerName":"Malith Silva","jobTitle":"Need a plumber for a leaking kitchen pipe"}, link: "/jobs" },
  { userId: "user_c013", type: "JOB_RESPONSE", payload: {"providerName":"Menaka Gunasekara","jobTitle":"Want a custom bookshelf built for the living room"}, link: "/jobs", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_c017", type: "JOB_RESPONSE", payload: {"providerName":"Kannan Ratnayake","jobTitle":"Need a mechanic to look at a strange engine noise"}, link: "/jobs" },
  { userId: "user_c021", type: "JOB_RESPONSE", payload: {"providerName":"Kasun Herath","jobTitle":"Looking for an electrician to fix a tripping circuit"}, link: "/jobs" },
  { userId: "user_c025", type: "JOB_RESPONSE", payload: {"providerName":"Sanduni Wijesinghe","jobTitle":"Need a plumber for a leaking kitchen pipe"}, link: "/jobs", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_c029", type: "JOB_RESPONSE", payload: {"providerName":"Nadeeka Jayawardena","jobTitle":"Want a custom bookshelf built for the living room"}, link: "/jobs" },
  { userId: "user_dilani", type: "SAVED_SEARCH_MATCH", payload: {"providerName":"Nuwan Perera","district":"Colombo"}, link: "/providers/prov_nuwan", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_c007", type: "SAVED_SEARCH_MATCH", payload: {"providerName":"Nimali Dissanayake","district":"Kalutara"}, link: "/providers/prov_p010" },
  { userId: "user_c013", type: "SAVED_SEARCH_MATCH", payload: {"providerName":"Farhana Nadesan","district":"Matale"}, link: "/providers/prov_p019" },
  { userId: "user_c019", type: "SAVED_SEARCH_MATCH", payload: {"providerName":"Anushka Karunaratne","district":"Galle"}, link: "/providers/prov_p028", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_c025", type: "SAVED_SEARCH_MATCH", payload: {"providerName":"Rajeswari Hameed","district":"Hambantota"}, link: "/providers/prov_p037" },
  { userId: "user_dilani", type: "SAVED_SEARCH_MATCH", payload: {"providerName":"Shanika Senanayake","district":"Batticaloa"}, link: "/providers/prov_p046" },
  { userId: "user_c007", type: "SAVED_SEARCH_MATCH", payload: {"providerName":"Mohamed Rizwan","district":"Ampara"}, link: "/providers/prov_rizwan", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_c013", type: "SAVED_SEARCH_MATCH", payload: {"providerName":"Lasantha Ismail","district":"Puttalam"}, link: "/providers/prov_p014" },
  { userId: "user_nuwan", type: "REPORT_RESOLVED", payload: {"status":"RESOLVED"}, link: "/account/notifications", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_c004", type: "REPORT_RESOLVED", payload: {"status":"DISMISSED"}, link: "/account/notifications" },
  { userId: "user_p021", type: "REPORT_RESOLVED", payload: {"status":"RESOLVED"}, link: "/account/notifications", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_c010", type: "REPORT_RESOLVED", payload: {"status":"DISMISSED"}, link: "/account/notifications" },
  { userId: "user_p041", type: "REPORT_RESOLVED", payload: {"status":"RESOLVED"}, link: "/account/notifications", readAt: new Date("2026-06-01T09:00:00Z") },
  { userId: "user_c016", type: "REPORT_RESOLVED", payload: {"status":"DISMISSED"}, link: "/account/notifications" },
];

const PREFERENCES = [
  { userId: "user_nuwan", type: "NEW_INQUIRY", emailEnabled: false, inAppEnabled: true },
  { userId: "user_c009", type: "NEW_REVIEW", emailEnabled: true, inAppEnabled: true },
  { userId: "user_p027", type: "NEW_JOB_MATCH", emailEnabled: true, inAppEnabled: true },
  { userId: "user_c025", type: "THREAD_REPLY", emailEnabled: false, inAppEnabled: true },
  { userId: "user_kumari", type: "NEW_INQUIRY", emailEnabled: true, inAppEnabled: true },
  { userId: "user_c011", type: "NEW_REVIEW", emailEnabled: true, inAppEnabled: true },
  { userId: "user_p029", type: "NEW_JOB_MATCH", emailEnabled: false, inAppEnabled: true },
  { userId: "user_c027", type: "THREAD_REPLY", emailEnabled: true, inAppEnabled: true },
  { userId: "user_rizwan", type: "NEW_INQUIRY", emailEnabled: true, inAppEnabled: true },
  { userId: "user_c013", type: "NEW_REVIEW", emailEnabled: false, inAppEnabled: true },
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
  for (const p of PREFERENCES) {
    await db.notificationPreference.create({ data: p });
  }

  console.log(`Seeded ${NOTIFICATIONS.length} notifications and ${PREFERENCES.length} preferences.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
