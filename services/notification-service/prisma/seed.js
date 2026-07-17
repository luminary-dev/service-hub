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

// ---------------------------------------------------------------------------
// #632 seed-data expansion — batch 2 ("demo everything" scale). The hard-coded
// NOTIFICATIONS above already cover all 10 catalog types; this block fans the
// same 10 types out across the new provider users (user_p051..user_p150) and
// customers (user_c031..user_c100), mixing read/unread, so the feed is rich for
// every seeded account. Recipient IDs / prov_* links continue the scheme.
// ---------------------------------------------------------------------------
const pad3 = (n) => String(n).padStart(3, "0");
const NG_FIRST = ["Nadeeka", "Dinesh", "Chathura", "Nimali", "Saman", "Ruwan", "Yasodha", "Lasantha", "Gayan", "Hasini", "Menaka", "Kumaran", "Fazil", "Suresh", "Kasun", "Amila"];
const NG_LAST = ["Perera", "Fernando", "Silva", "Bandara", "Herath", "Mendis", "Rajapaksa", "Wijesinghe", "Kumar", "Selvam", "Rathnayake", "Gunasekara"];
const ngName = (k) => `${NG_FIRST[k % NG_FIRST.length]} ${NG_LAST[(k * 7) % NG_LAST.length]}`;
const NG_DISTRICTS = ["Colombo", "Gampaha", "Kalutara", "Kandy", "Galle", "Matara", "Jaffna", "Kurunegala", "Anuradhapura", "Batticaloa"];
const NG_JOB_TITLES = [
  "Need a mechanic to look at a strange engine noise",
  "Looking for an electrician to fix a tripping circuit",
  "Need a plumber for a leaking kitchen pipe",
  "Want a custom bookshelf built for the living room",
  "AC not cooling properly, need a technician",
];
const NG_REJECTIONS = [
  "NIC photo was blurry — please re-upload a clear photo of both sides.",
  "Document did not match the name on the account.",
];
const PROVIDER_USER_IDS = Array.from({ length: 100 }, (_, k) => `user_p${pad3(k + 51)}`);
const CUSTOMER_USER_IDS = Array.from({ length: 70 }, (_, k) => `user_c${pad3(k + 31)}`);
const READ_AT = new Date("2026-06-15T09:00:00Z");

// Build one notification of `type` for recipient index k.
function providerNote(userId, k, type) {
  const provId = userId.replace("user_p", "prov_p");
  const base = { userId, type, readAt: k % 2 === 0 ? READ_AT : undefined };
  switch (type) {
    case "NEW_INQUIRY": return { ...base, payload: { customerName: ngName(k) }, link: "/dashboard" };
    case "THREAD_REPLY": return { ...base, payload: { senderName: ngName(k + 1) }, link: "/dashboard" };
    case "NEW_REVIEW": return { ...base, payload: { reviewerName: ngName(k + 2), rating: (k % 5) + 1 }, link: `/providers/${provId}` };
    case "VERIFICATION_APPROVED": return { ...base, payload: {}, link: "/dashboard" };
    case "VERIFICATION_REJECTED": return { ...base, payload: { reason: NG_REJECTIONS[k % NG_REJECTIONS.length] }, link: "/dashboard" };
    case "NEW_JOB_MATCH": return { ...base, payload: { district: NG_DISTRICTS[k % NG_DISTRICTS.length], jobTitle: NG_JOB_TITLES[k % NG_JOB_TITLES.length] }, link: "/jobs" };
    default: return { ...base, payload: {}, link: "/dashboard" };
  }
}
function customerNote(userId, k, type) {
  const provId = `prov_p${pad3((k % 100) + 51)}`;
  const base = { userId, type, readAt: k % 2 === 1 ? READ_AT : undefined };
  switch (type) {
    case "REVIEW_RESPONSE": return { ...base, payload: { providerName: ngName(k) }, link: `/providers/${provId}` };
    case "JOB_RESPONSE": return { ...base, payload: { providerName: ngName(k + 1), jobTitle: NG_JOB_TITLES[k % NG_JOB_TITLES.length] }, link: "/jobs" };
    case "SAVED_SEARCH_MATCH": return { ...base, payload: { providerName: ngName(k + 2), district: NG_DISTRICTS[k % NG_DISTRICTS.length] }, link: `/providers/${provId}` };
    case "REPORT_RESOLVED": return { ...base, payload: { status: k % 2 === 0 ? "RESOLVED" : "DISMISSED" }, link: "/account/notifications" };
    case "THREAD_REPLY": return { ...base, payload: { senderName: ngName(k + 3) }, link: "/account/notifications" };
    default: return { ...base, payload: {}, link: "/account/notifications" };
  }
}
const PROVIDER_TYPES = ["NEW_INQUIRY", "THREAD_REPLY", "NEW_REVIEW", "VERIFICATION_APPROVED", "VERIFICATION_REJECTED", "NEW_JOB_MATCH"];
const CUSTOMER_TYPES = ["REVIEW_RESPONSE", "JOB_RESPONSE", "SAVED_SEARCH_MATCH", "REPORT_RESOLVED", "THREAD_REPLY"];
const GEN_NOTIFICATIONS = [];
PROVIDER_USER_IDS.forEach((uid, k) => {
  GEN_NOTIFICATIONS.push(providerNote(uid, k, PROVIDER_TYPES[k % PROVIDER_TYPES.length]));
  GEN_NOTIFICATIONS.push(providerNote(uid, k + 3, PROVIDER_TYPES[(k + 2) % PROVIDER_TYPES.length]));
});
CUSTOMER_USER_IDS.forEach((uid, k) => {
  GEN_NOTIFICATIONS.push(customerNote(uid, k, CUSTOMER_TYPES[k % CUSTOMER_TYPES.length]));
  GEN_NOTIFICATIONS.push(customerNote(uid, k + 2, CUSTOMER_TYPES[(k + 1) % CUSTOMER_TYPES.length]));
});

// Preferences for a sample of the new users — one per user, unique (userId,type).
const GEN_PREFERENCES = [];
PROVIDER_USER_IDS.filter((_, k) => k % 5 === 0).forEach((uid, k) => {
  GEN_PREFERENCES.push({ userId: uid, type: PROVIDER_TYPES[k % PROVIDER_TYPES.length], emailEnabled: k % 2 === 0, inAppEnabled: true });
});
CUSTOMER_USER_IDS.filter((_, k) => k % 5 === 0).forEach((uid, k) => {
  GEN_PREFERENCES.push({ userId: uid, type: CUSTOMER_TYPES[k % CUSTOMER_TYPES.length], emailEnabled: k % 2 === 1, inAppEnabled: true });
});

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

  for (const n of [...NOTIFICATIONS, ...GEN_NOTIFICATIONS]) {
    await db.notification.create({ data: n });
  }
  for (const p of [...PREFERENCES, ...GEN_PREFERENCES]) {
    await db.notificationPreference.create({ data: p });
  }

  const totalNotifications = NOTIFICATIONS.length + GEN_NOTIFICATIONS.length;
  const totalPreferences = PREFERENCES.length + GEN_PREFERENCES.length;
  console.log(`Seeded ${totalNotifications} notifications and ${totalPreferences} preferences.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
