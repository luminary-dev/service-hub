import type { Locale } from "./i18n";

// Legal page copy (#62). Lives outside the i18n dict on purpose: the dict is
// bundled into every client page via I18nProvider, and these long documents
// are only ever rendered server-side on /terms and /privacy. English is the
// authoritative text; the Sinhala version is a translation of it. Both
// locales must keep the same section/paragraph structure (legal.test.ts).

export type LegalSection = { heading: string; body: string[] };

export type LegalDoc = {
  title: string;
  metaDescription: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
};

export const CONTACT_EMAIL = "hello@baas.lk";

const termsEn: LegalDoc = {
  title: "Terms of Service",
  metaDescription:
    "The terms that govern your use of Baas.lk, the free marketplace connecting Sri Lankan customers with trusted local service professionals.",
  updated: "Last updated: 13 July 2026",
  intro:
    "Welcome to Baas.lk. These Terms of Service (the “Terms”) govern your access to and use of the Baas.lk website and services (the “Service”). By creating an account or using the Service you agree to these Terms. If you do not agree with them, please do not use the Service.",
  sections: [
    {
      heading: "1. What Baas.lk is",
      body: [
        "Baas.lk is a free online marketplace that connects customers with independent service professionals (“providers”) across Sri Lanka — mechanics, electricians, plumbers, garden designers and more. Providers publish a public profile with their trade, location, rates and photos of past work; customers browse, compare and contact them directly by phone, WhatsApp, inquiry or job post.",
        "Baas.lk is not a party to any agreement between a customer and a provider. We do not employ providers, we do not supervise or guarantee their work, and we do not process payments. The price, scope and payment for any work are agreed and settled directly between you and the other party, outside the platform. Baas.lk charges no commission and no booking fees.",
      ],
    },
    {
      heading: "2. Your account",
      body: [
        "You need an account to contact providers, post jobs, leave reviews or offer your services. You can register with an email address and password, or continue with Google or Facebook. You must be at least 18 years old and provide accurate information, including a working phone number where one is required.",
        "You are responsible for keeping your sign-in details safe and for everything that happens under your account. Tell us promptly if you believe your account has been compromised. You may close your account at any time from your account settings.",
      ],
    },
    {
      heading: "3. Provider profiles",
      body: [
        "If you register as a provider, the details you publish — your name, trade, district, city, headline, description, rates, contact details and photos — form a public profile that is visible to anyone, including search engines. Keep them accurate and up to date.",
        "Rates shown on Baas.lk are informational only. The final price for any work is whatever you and the customer agree between yourselves.",
        "Only upload photos of your own work that you have the right to share, and do not misrepresent your qualifications, experience or identity. A verification badge means we have reviewed the documents a provider submitted; it is not a guarantee of the quality or safety of their work.",
      ],
    },
    {
      heading: "4. Reviews, jobs and messages",
      body: [
        "Reviews may only describe a genuine experience you have had with a provider. Do not post fake, paid-for or retaliatory reviews, and do not review your own business.",
        "Job posts, inquiries and messages must relate to genuine service requests. Do not use them to spam other users, advertise unrelated products or harvest contact details.",
      ],
    },
    {
      heading: "5. Acceptable use",
      body: [
        "You agree not to: break any applicable law; impersonate any person or misrepresent your affiliation; harass, threaten or defame others; post content that is unlawful, obscene, hateful or infringes anyone’s rights; upload malware or attempt to breach the security of the Service; scrape, bulk-download or resell content from the Service; or interfere with other users’ use of the Service.",
      ],
    },
    {
      heading: "6. Your content",
      body: [
        "You keep ownership of the content you post — profiles, photos, reviews, job posts and messages. By posting it you grant Baas.lk a non-exclusive, worldwide, royalty-free licence to host, display, reproduce and distribute that content for the purpose of operating and promoting the Service.",
        "You are responsible for the content you post. We may remove content that violates these Terms or that we reasonably consider harmful, and we may suspend or terminate accounts that seriously or repeatedly violate them.",
      ],
    },
    {
      heading: "7. Disclaimers",
      body: [
        "The Service is provided “as is” and “as available”, without warranties of any kind. Providers on Baas.lk are independent businesses and individuals; we do not endorse or guarantee any provider or customer, nor the quality, safety, legality or timeliness of any work. Check qualifications and agree terms carefully before hiring anyone.",
      ],
    },
    {
      heading: "8. Limitation of liability",
      body: [
        "To the maximum extent permitted by law, Baas.lk and its operators are not liable for any indirect, incidental, special or consequential damages, or for any loss arising from dealings between customers and providers, from user content, or from your use of or inability to use the Service. Nothing in these Terms excludes liability that cannot be excluded under the law of Sri Lanka.",
      ],
    },
    {
      heading: "9. Changes to the Service and these Terms",
      body: [
        "We may change, suspend or discontinue any part of the Service at any time. We may also update these Terms from time to time; the “last updated” date above shows the current version. If we make a material change we will take reasonable steps to notify you, such as a notice on the site or an email. Continuing to use the Service after a change takes effect means you accept the updated Terms.",
      ],
    },
    {
      heading: "10. Governing law",
      body: [
        "These Terms are governed by the laws of the Democratic Socialist Republic of Sri Lanka, and any dispute arising from them is subject to the exclusive jurisdiction of the courts of Sri Lanka.",
      ],
    },
    {
      heading: "11. Contact",
      body: [
        `Questions about these Terms? Email us at ${CONTACT_EMAIL}.`,
      ],
    },
  ],
};

const termsSi: LegalDoc = {
  title: "සේවා කොන්දේසි",
  metaDescription:
    "ලංකාවේ පාරිභෝගිකයන් විශ්වාසවන්ත ප්‍රාදේශීය වෘත්තිකයන් සමඟ සම්බන්ධ කරන නොමිලේ වෙළඳපොළ වන Baas.lk භාවිතය පාලනය කරන කොන්දේසි.",
  updated: "යාවත්කාලීන කළේ: 2026 ජූලි 13",
  intro:
    "Baas.lk වෙත සාදරයෙන් පිළිගනිමු. මෙම සේවා කොන්දේසි (“කොන්දේසි”) Baas.lk වෙබ් අඩවියට සහ සේවාවලට (“සේවාව”) ඔබේ ප්‍රවේශය සහ භාවිතය පාලනය කරයි. ගිණුමක් සෑදීමෙන් හෝ සේවාව භාවිතා කිරීමෙන් ඔබ මෙම කොන්දේසි පිළිගනී. ඒවාට එකඟ නොවන්නේ නම්, කරුණාකර සේවාව භාවිතා නොකරන්න.",
  sections: [
    {
      heading: "1. Baas.lk යනු කුමක්ද",
      body: [
        "Baas.lk යනු ලංකාව පුරා පාරිභෝගිකයන් ස්වාධීන වෘත්තිකයන් (“සේවා සපයන්නන්”) සමඟ සම්බන්ධ කරන නොමිලේ අන්තර්ජාල වෙළඳපොළකි — කාර්මිකයන්, විදුලි කාර්මිකයන්, ජල නළ කාර්මිකයන්, උද්‍යාන නිර්මාණකරුවන් සහ තවත් අය. සේවා සපයන්නන් ඔවුන්ගේ ක්ෂේත්‍රය, ස්ථානය, ගාස්තු සහ කළ වැඩවල ඡායාරූප සහිත පොදු පැතිකඩක් පළ කරයි; පාරිභෝගිකයන් ඒවා බලා, සසඳා, දුරකථනයෙන්, WhatsApp මගින්, විමසුමකින් හෝ රැකියා දැන්වීමකින් ඔවුන්ව සෘජුවම සම්බන්ධ කරගනී.",
        "පාරිභෝගිකයෙකු සහ සේවා සපයන්නෙකු අතර ඇති කිසිදු ගිවිසුමකට Baas.lk පාර්ශ්වයක් නොවේ. අපි සේවා සපයන්නන් සේවයේ යොදවන්නේ නැත, ඔවුන්ගේ වැඩ අධීක්ෂණය හෝ සහතික කරන්නේ නැත, ගෙවීම් සැකසුම් කරන්නේද නැත. ඕනෑම වැඩක මිල, විෂය පථය සහ ගෙවීම ඔබ සහ අනෙක් පාර්ශ්වය අතර, වේදිකාවෙන් පිටත, සෘජුවම එකඟ වී විසඳාගනී. Baas.lk කොමිස් මුදල් හෝ වෙන්කිරීමේ ගාස්තු අය නොකරයි.",
      ],
    },
    {
      heading: "2. ඔබේ ගිණුම",
      body: [
        "සේවා සපයන්නන් සම්බන්ධ කරගැනීමට, රැකියා පළ කිරීමට, සමාලෝචන ලිවීමට හෝ ඔබේ සේවා පිරිනැමීමට ගිණුමක් අවශ්‍යයි. විද්‍යුත් තැපැල් ලිපිනයක් සහ මුරපදයක් සමඟ, නැතහොත් Google හෝ Facebook හරහා ලියාපදිංචි විය හැක. ඔබ අවම වශයෙන් වයස අවුරුදු 18ක් විය යුතු අතර, අවශ්‍ය තැන්වල ක්‍රියාකාරී දුරකථන අංකයක් ඇතුළුව නිවැරදි තොරතුරු ලබා දිය යුතුය.",
        "ඔබේ පිවිසුම් තොරතුරු ආරක්ෂා කරගැනීම සහ ඔබේ ගිණුම යටතේ සිදුවන සියල්ල පිළිබඳ වගකීම ඔබ සතුය. ඔබේ ගිණුමට අනවසර ප්‍රවේශයක් සිදුවී ඇතැයි සිතන්නේ නම් වහාම අපට දන්වන්න. ඔබේ ගිණුම් සැකසුම් වෙතින් ඕනෑම වේලාවක ගිණුම වසා දැමිය හැක.",
      ],
    },
    {
      heading: "3. සේවා සපයන්නන්ගේ පැතිකඩ",
      body: [
        "ඔබ සේවා සපයන්නෙකු ලෙස ලියාපදිංචි වන්නේ නම්, ඔබ පළ කරන තොරතුරු — නම, ක්ෂේත්‍රය, දිස්ත්‍රික්කය, නගරය, සිරස්තලය, විස්තරය, ගාස්තු, සම්බන්ධතා තොරතුරු සහ ඡායාරූප — සෙවුම් යන්ත්‍ර ඇතුළු ඕනෑම කෙනෙකුට දිස්වන පොදු පැතිකඩක් සාදයි. ඒවා නිවැරදිව සහ යාවත්කාලීනව තබාගන්න.",
        "Baas.lk හි පෙන්වන ගාස්තු තොරතුරු සඳහා පමණි. ඕනෑම වැඩක අවසාන මිල ඔබ සහ පාරිභෝගිකයා අතර එකඟ වන දෙයයි.",
        "බෙදාගැනීමට අයිතිය ඇති, ඔබේම වැඩවල ඡායාරූප පමණක් උඩුගත කරන්න; ඔබේ සුදුසුකම්, පළපුරුද්ද හෝ අනන්‍යතාව වැරදි ලෙස නොපෙන්වන්න. සත්‍යාපන ලාංඡනයක් යනු සේවා සපයන්නෙකු ඉදිරිපත් කළ ලේඛන අප සමාලෝචනය කර ඇති බවයි; එය ඔවුන්ගේ වැඩවල ගුණාත්මකභාවය හෝ ආරක්ෂාව පිළිබඳ සහතිකයක් නොවේ.",
      ],
    },
    {
      heading: "4. සමාලෝචන, රැකියා සහ පණිවිඩ",
      body: [
        "සමාලෝචනවලින් විස්තර කළ හැක්කේ සේවා සපයන්නෙකු සමඟ ඔබට ඇති වූ සැබෑ අත්දැකීමක් පමණි. ව්‍යාජ, මුදලට ලියූ හෝ පළිගැනීමේ සමාලෝචන පළ නොකරන්න; ඔබේම ව්‍යාපාරය සමාලෝචනය නොකරන්න.",
        "රැකියා දැන්වීම්, විමසුම් සහ පණිවිඩ සැබෑ සේවා අවශ්‍යතාවලට අදාළ විය යුතුය. අනෙක් පරිශීලකයන්ට spam යැවීමට, අදාළ නොවන නිෂ්පාදන ප්‍රචාරණයට හෝ සම්බන්ධතා තොරතුරු එකතු කිරීමට ඒවා භාවිතා නොකරන්න.",
      ],
    },
    {
      heading: "5. පිළිගත හැකි භාවිතය",
      body: [
        "ඔබ මේවා නොකිරීමට එකඟ වේ: අදාළ කිසිදු නීතියක් කඩ කිරීම; වෙනත් අයෙකු ලෙස පෙනී සිටීම හෝ ඔබේ සම්බන්ධතාව වැරදි ලෙස පෙන්වීම; අන් අයට හිරිහැර කිරීම, තර්ජනය කිරීම හෝ අපහාස කිරීම; නීතිවිරෝධී, අසභ්‍ය, වෛරී හෝ අන් අයගේ අයිතිවාසිකම් උල්ලංඝනය කරන අන්තර්ගත පළ කිරීම; අනිෂ්ට මෘදුකාංග උඩුගත කිරීම හෝ සේවාවේ ආරක්ෂාව බිඳීමට උත්සාහ කිරීම; සේවාවේ අන්තර්ගත scrape කිරීම, තොග වශයෙන් බාගැනීම හෝ නැවත විකිණීම; නැතහොත් අනෙක් පරිශීලකයන්ගේ සේවා භාවිතයට බාධා කිරීම.",
      ],
    },
    {
      heading: "6. ඔබේ අන්තර්ගතය",
      body: [
        "ඔබ පළ කරන අන්තර්ගතයේ — පැතිකඩ, ඡායාරූප, සමාලෝචන, රැකියා දැන්වීම් සහ පණිවිඩවල — අයිතිය ඔබ සතුව පවතී. ඒවා පළ කිරීමෙන්, සේවාව පවත්වාගෙන යාම සහ ප්‍රවර්ධනය සඳහා එම අන්තර්ගතය සත්කාරකත්වයට, ප්‍රදර්ශනයට, ප්‍රතිනිෂ්පාදනයට සහ බෙදාහැරීමට Baas.lk වෙත ඒකාධිකාරී නොවන, ලොව පුරා වලංගු, ගාස්තු රහිත බලපත්‍රයක් ඔබ ලබා දේ.",
        "ඔබ පළ කරන අන්තර්ගතය පිළිබඳ වගකීම ඔබ සතුය. මෙම කොන්දේසි උල්ලංඝනය කරන හෝ හානිකර යැයි සාධාරණව සලකන අන්තර්ගත අපට ඉවත් කළ හැකි අතර, ඒවා බරපතළ ලෙස හෝ නැවත නැවත උල්ලංඝනය කරන ගිණුම් අත්හිටුවීමට හෝ අවසන් කිරීමට හැක.",
      ],
    },
    {
      heading: "7. වගකීම් ප්‍රතික්ෂේප",
      body: [
        "සේවාව සපයන්නේ කිසිදු වගකීමකින් තොරව, “ඇති ආකාරයට” සහ “ලබාගත හැකි ආකාරයට” ය. Baas.lk හි සේවා සපයන්නන් ස්වාධීන ව්‍යාපාර සහ පුද්ගලයන් ය; අපි කිසිදු සේවා සපයන්නෙකු හෝ පාරිභෝගිකයෙකු, නැතහොත් කිසිදු වැඩක ගුණාත්මකභාවය, ආරක්ෂාව, නීත්‍යනුකූලභාවය හෝ කාලානුරූපභාවය අනුමත හෝ සහතික නොකරමු. කිසිවෙකු සේවයට ගැනීමට පෙර සුදුසුකම් පරීක්ෂා කර කොන්දේසි ප්‍රවේශමෙන් එකඟ වන්න.",
      ],
    },
    {
      heading: "8. වගකීම් සීමාව",
      body: [
        "නීතියෙන් අවසර ඇති උපරිම ප්‍රමාණයට, පාරිභෝගිකයන් සහ සේවා සපයන්නන් අතර ගනුදෙනුවලින්, පරිශීලක අන්තර්ගතවලින්, නැතහොත් සේවාව භාවිතයෙන් හෝ භාවිත කළ නොහැකිවීමෙන් පැන නගින කිසිදු වක්‍ර, ආනුෂංගික, විශේෂ හෝ ප්‍රතිඵලමය හානියකට Baas.lk සහ එහි ක්‍රියාකරුවන් වගකියනු නොලැබේ. ලංකාවේ නීතිය යටතේ බැහැර කළ නොහැකි වගකීම් මෙම කොන්දේසිවලින් බැහැර නොවේ.",
      ],
    },
    {
      heading: "9. සේවාවේ සහ මෙම කොන්දේසිවල වෙනස්කම්",
      body: [
        "සේවාවේ ඕනෑම කොටසක් ඕනෑම වේලාවක වෙනස් කිරීමට, අත්හිටුවීමට හෝ නතර කිරීමට අපට හැක. මෙම කොන්දේසිද කලින් කලට යාවත්කාලීන කළ හැක; ඉහත “යාවත්කාලීන කළේ” දිනය වත්මන් අනුවාදය පෙන්වයි. වැදගත් වෙනසක් කරන්නේ නම්, අඩවියේ දැන්වීමක් හෝ විද්‍යුත් තැපෑලක් වැනි සාධාරණ ක්‍රමයකින් ඔබට දැනුම් දෙන්නෙමු. වෙනසක් බලාත්මක වූ පසුවත් සේවාව දිගටම භාවිතා කිරීම යනු යාවත්කාලීන කොන්දේසි ඔබ පිළිගන්නා බවයි.",
      ],
    },
    {
      heading: "10. පාලන නීතිය",
      body: [
        "මෙම කොන්දේසි ශ්‍රී ලංකා ප්‍රජාතාන්ත්‍රික සමාජවාදී ජනරජයේ නීතිවලට යටත් වන අතර, ඒවායින් පැන නගින ඕනෑම ආරවුලක් ලංකාවේ අධිකරණවල තනි අධිකරණ බලයට යටත් වේ.",
      ],
    },
    {
      heading: "11. සම්බන්ධ වන්න",
      body: [
        `මෙම කොන්දේසි ගැන ප්‍රශ්නද? ${CONTACT_EMAIL} වෙත විද්‍යුත් තැපෑලක් එවන්න.`,
      ],
    },
  ],
};

const privacyEn: LegalDoc = {
  title: "Privacy Policy",
  metaDescription:
    "How Baas.lk collects, uses, shares and protects your personal data, and the choices and rights you have — including under Sri Lanka's Personal Data Protection Act.",
  updated: "Last updated: 13 July 2026",
  intro:
    "This policy explains what personal data Baas.lk collects, why we collect it, how we use and share it, how long we keep it, and the rights you have — including under Sri Lanka’s Personal Data Protection Act, No. 9 of 2022 (PDPA). It applies to everything on baas.lk.",
  sections: [
    {
      heading: "1. Who we are",
      body: [
        `Baas.lk is a free marketplace, operated from Sri Lanka, that connects customers with independent service professionals. For the personal data described in this policy, Baas.lk is the data controller. You can reach us at ${CONTACT_EMAIL}.`,
      ],
    },
    {
      heading: "2. Data we collect",
      body: [
        "Account data — your name, email address, phone number and a hashed (never plain-text) version of your password. If you continue with Google or Facebook we receive your name and verified email address from that provider; we never see your social-media password.",
        "Provider profile data — if you register as a provider: your trade, district, city, headline and description (optionally in Sinhala too), years of experience, your services with indicative rates, contact details (phone, WhatsApp, social links, website), profile and work photos, and any verification documents you submit.",
        "Content you create — reviews and review photos, job posts, inquiries, messages to providers, and reports you file.",
        "Technical data — cookies (session, language and theme), IP addresses and basic request logs used for security, rate limiting and abuse prevention. Uploaded images are re-encoded and their embedded location metadata (EXIF) is stripped before storage.",
      ],
    },
    {
      heading: "3. How we use your data",
      body: [
        "To run the marketplace: create and secure your account, display provider profiles, and deliver inquiries, job posts, responses, messages and reviews between users.",
        "To communicate with you: transactional email such as verification links, password resets and inquiry or job notifications. We do not send marketing email without your consent.",
        "To keep the Service safe: moderation, investigating reports, enforcing our Terms of Service, rate limiting, and preventing fraud and abuse.",
        "To comply with our legal obligations under Sri Lankan law.",
      ],
    },
    {
      heading: "4. Our legal bases (PDPA)",
      body: [
        "We process your data: to perform our contract with you (running your account and the features you use); with your consent (for example the optional profile details and photos you choose to publish); for our legitimate interests in keeping the Service secure and free of abuse; and to meet legal obligations. Where processing relies on your consent, you can withdraw it at any time.",
      ],
    },
    {
      heading: "5. What is public",
      body: [
        "Provider profiles are public by design: the name, trade, location, headline, description, rates, contact details and photos a provider publishes are visible to anyone and may be indexed by search engines. Reviews are shown publicly with the reviewer’s name.",
        "Customer accounts are not public. Your inquiries, job responses and message threads are visible only to the people involved in them, and to our moderation staff where necessary.",
      ],
    },
    {
      heading: "6. Who we share data with",
      body: [
        "Processors that run the Service on our behalf: Cloudflare R2 stores uploaded images in a private bucket (they are served through the site, never directly), Resend delivers our transactional email, and our hosting infrastructure runs the platform. These providers act only on our instructions.",
        "If you use the chat assistant, the messages you type into it are processed by our AI provider (Anthropic) to generate replies. The assistant cannot access or act on your account.",
        "We do not sell your personal data and we do not share it with advertisers. We may disclose data where the law requires it, to enforce our Terms, or to protect the rights and safety of our users.",
      ],
    },
    {
      heading: "7. Cookies",
      body: [
        "We use a small number of first-party cookies: a session cookie that keeps you signed in (a signed token), and preference cookies that remember your language and theme. We do not use advertising or cross-site tracking cookies.",
      ],
    },
    {
      heading: "8. How long we keep data",
      body: [
        "We keep your data for as long as your account is active. If you delete your account (Account → delete account), your profile, photos, reviews, inquiries, job posts and responses are deleted from the Service; we retain only a minimal record of the deletion (your email address and role) for audit and abuse-prevention purposes, and short-lived security logs that expire on their own schedule.",
      ],
    },
    {
      heading: "9. Your rights",
      body: [
        `Under the PDPA you have the right to access the personal data we hold about you, to have inaccurate data corrected, to have your data erased, and to withdraw consent you have given. You can edit your details and delete your account yourself from your account settings, or email us at ${CONTACT_EMAIL} for any request. You may also lodge a complaint with the Data Protection Authority of Sri Lanka.`,
      ],
    },
    {
      heading: "10. Security",
      body: [
        "We protect your data with industry-standard measures: encrypted connections (HTTPS), hashed passwords, private image storage, and internal systems that are not reachable from the public internet. No online service is perfectly secure, so please use a strong, unique password.",
      ],
    },
    {
      heading: "11. Children",
      body: [
        "Baas.lk is not directed at children, and you must be at least 18 years old to hold an account. We do not knowingly collect personal data from children; if you believe a child has given us personal data, contact us and we will delete it.",
      ],
    },
    {
      heading: "12. Changes to this policy",
      body: [
        "We may update this policy from time to time; the “last updated” date above shows the current version. If we make a material change we will announce it on the site or by email.",
      ],
    },
    {
      heading: "13. Contact",
      body: [
        `For any privacy question or request, email us at ${CONTACT_EMAIL}.`,
      ],
    },
  ],
};

const privacySi: LegalDoc = {
  title: "රහස්‍යතා ප්‍රතිපත්තිය",
  metaDescription:
    "Baas.lk ඔබේ පුද්ගලික දත්ත එකතු කරන, භාවිතා කරන, බෙදාගන්නා සහ ආරක්ෂා කරන ආකාරය, සහ ලංකාවේ පුද්ගලික දත්ත ආරක්ෂණ පනත ඇතුළුව ඔබට ඇති අයිතිවාසිකම්.",
  updated: "යාවත්කාලීන කළේ: 2026 ජූලි 13",
  intro:
    "මෙම ප්‍රතිපත්තිය Baas.lk එකතු කරන පුද්ගලික දත්ත මොනවාද, ඒවා එකතු කරන්නේ ඇයි, භාවිතා කරන සහ බෙදාගන්නා ආකාරය, තබාගන්නා කාලය, සහ ඔබට ඇති අයිතිවාසිකම් — 2022 අංක 9 දරන ලංකාවේ පුද්ගලික දත්ත ආරක්ෂණ පනත (PDPA) යටතේ ඇති ඒවා ඇතුළුව — පැහැදිලි කරයි. එය baas.lk හි සියල්ලට අදාළ වේ.",
  sections: [
    {
      heading: "1. අපි කවුද",
      body: [
        `Baas.lk යනු ලංකාවෙන් ක්‍රියාත්මක වන, පාරිභෝගිකයන් ස්වාධීන වෘත්තිකයන් සමඟ සම්බන්ධ කරන නොමිලේ වෙළඳපොළකි. මෙම ප්‍රතිපත්තියේ විස්තර වන පුද්ගලික දත්ත සඳහා දත්ත පාලකයා Baas.lk වේ. ${CONTACT_EMAIL} හරහා අප හා සම්බන්ධ විය හැක.`,
      ],
    },
    {
      heading: "2. අප එකතු කරන දත්ත",
      body: [
        "ගිණුම් දත්ත — ඔබේ නම, විද්‍යුත් තැපැල් ලිපිනය, දුරකථන අංකය සහ ඔබේ මුරපදයේ hash කළ (කිසිවිටෙක සරල පෙළ නොවන) අනුවාදයක්. Google හෝ Facebook හරහා පිවිසෙන්නේ නම්, එම සේවාවෙන් ඔබේ නම සහ සත්‍යාපිත විද්‍යුත් තැපැල් ලිපිනය අපට ලැබේ; ඔබේ සමාජ මාධ්‍ය මුරපදය අපට කිසිවිටෙක නොපෙනේ.",
        "සේවා සපයන්නාගේ පැතිකඩ දත්ත — ඔබ සේවා සපයන්නෙකු ලෙස ලියාපදිංචි වන්නේ නම්: ඔබේ ක්ෂේත්‍රය, දිස්ත්‍රික්කය, නගරය, සිරස්තලය සහ විස්තරය (අවශ්‍ය නම් සිංහලෙන්ද), පළපුරුදු වසර ගණන, ගාස්තු සහිත සේවා ලැයිස්තුව, සම්බන්ධතා තොරතුරු (දුරකථනය, WhatsApp, සමාජ මාධ්‍ය සබැඳි, වෙබ් අඩවිය), පැතිකඩ සහ වැඩ ඡායාරූප, සහ ඔබ ඉදිරිපත් කරන සත්‍යාපන ලේඛන.",
        "ඔබ සාදන අන්තර්ගත — සමාලෝචන සහ ඒවායේ ඡායාරූප, රැකියා දැන්වීම්, විමසුම්, සේවා සපයන්නන්ට යවන පණිවිඩ, සහ ඔබ කරන වාර්තා කිරීම්.",
        "තාක්ෂණික දත්ත — cookies (සැසිය, භාෂාව සහ තේමාව), ආරක්ෂාව, වේග සීමා කිරීම් සහ අනිසි භාවිත වැළැක්වීම සඳහා භාවිතා වන IP ලිපින සහ මූලික ඉල්ලීම් සටහන්. උඩුගත කරන ඡායාරූප ගබඩාවට පෙර නැවත කේතනය කර ඒවායේ ස්ථාන දත්ත (EXIF) ඉවත් කෙරේ.",
      ],
    },
    {
      heading: "3. ඔබේ දත්ත භාවිතා කරන ආකාරය",
      body: [
        "වෙළඳපොළ පවත්වාගෙන යාමට: ඔබේ ගිණුම සෑදීම සහ ආරක්ෂා කිරීම, සේවා සපයන්නන්ගේ පැතිකඩ පෙන්වීම, සහ පරිශීලකයන් අතර විමසුම්, රැකියා දැන්වීම්, ප්‍රතිචාර, පණිවිඩ සහ සමාලෝචන ලබා දීම.",
        "ඔබ සමඟ සන්නිවේදනයට: සත්‍යාපන සබැඳි, මුරපද යළි පිහිටුවීම් සහ විමසුම් හෝ රැකියා දැනුම්දීම් වැනි ගනුදෙනුමය විද්‍යුත් තැපෑල. ඔබේ කැමැත්තෙන් තොරව අලෙවිකරණ විද්‍යුත් තැපෑල නොයවමු.",
        "සේවාව ආරක්ෂිතව තැබීමට: අන්තර්ගත මධ්‍යස්ථකරණය, වාර්තා විමර්ශනය, සේවා කොන්දේසි බලාත්මක කිරීම, වේග සීමා කිරීම්, සහ වංචා හා අනිසි භාවිත වැළැක්වීම.",
        "ලංකාවේ නීතිය යටතේ අපගේ නීතිමය බැඳීම් ඉටු කිරීමට.",
      ],
    },
    {
      heading: "4. අපගේ නීතිමය පදනම් (PDPA)",
      body: [
        "අපි ඔබේ දත්ත සකසන්නේ: ඔබ සමඟ ඇති ගිවිසුම ඉටු කිරීමට (ඔබේ ගිණුම සහ ඔබ භාවිතා කරන විශේෂාංග පවත්වාගෙන යාම); ඔබේ කැමැත්ත ඇතිව (උදාහරණයක් ලෙස ඔබ පළ කිරීමට තෝරාගන්නා අමතර පැතිකඩ තොරතුරු සහ ඡායාරූප); සේවාව ආරක්ෂිතව සහ අනිසි භාවිතවලින් තොරව තැබීමේ අපගේ නීත්‍යනුකූල අවශ්‍යතා සඳහා; සහ නීතිමය බැඳීම් ඉටු කිරීමට ය. ඔබේ කැමැත්ත මත සිදුවන සැකසුම් සඳහා, එම කැමැත්ත ඕනෑම වේලාවක ඉවත් කරගත හැක.",
      ],
    },
    {
      heading: "5. පොදුවේ දිස්වන දේ",
      body: [
        "සේවා සපයන්නන්ගේ පැතිකඩ නිර්මාණයෙන්ම පොදුය: සේවා සපයන්නෙකු පළ කරන නම, ක්ෂේත්‍රය, ස්ථානය, සිරස්තලය, විස්තරය, ගාස්තු, සම්බන්ධතා තොරතුරු සහ ඡායාරූප ඕනෑම කෙනෙකුට දිස්වන අතර සෙවුම් යන්ත්‍රවලට ඇතුළත් විය හැක. සමාලෝචන, සමාලෝචකයාගේ නම සමඟ පොදුවේ පෙන්වයි.",
        "පාරිභෝගික ගිණුම් පොදු නොවේ. ඔබේ විමසුම්, රැකියා ප්‍රතිචාර සහ පණිවිඩ පෙළ දිස්වන්නේ ඒවාට සම්බන්ධ අයට සහ අවශ්‍ය විට අපගේ මධ්‍යස්ථකරණ කාර්ය මණ්ඩලයට පමණි.",
      ],
    },
    {
      heading: "6. දත්ත බෙදාගන්නේ කවුරුන් සමඟද",
      body: [
        "අප වෙනුවෙන් සේවාව ක්‍රියාත්මක කරන සැකසුම්කරුවන්: Cloudflare R2 උඩුගත කළ ඡායාරූප පුද්ගලික bucket එකක ගබඩා කරයි (ඒවා ලැබෙන්නේ අඩවිය හරහාය, කිසිවිටෙක සෘජුව නොවේ), Resend අපගේ ගනුදෙනුමය විද්‍යුත් තැපෑල බෙදාහරියි, අපගේ සත්කාරක යටිතල පහසුකම් වේදිකාව ක්‍රියාත්මක කරයි. මෙම සේවා ක්‍රියා කරන්නේ අපගේ උපදෙස් මත පමණි.",
        "ඔබ chat සහායකයා භාවිතා කරන්නේ නම්, ඔබ එයට ලියන පණිවිඩ පිළිතුරු සෑදීම සඳහා අපගේ AI සැපයුම්කරු (Anthropic) විසින් සකසනු ලැබේ. සහායකයාට ඔබේ ගිණුමට ප්‍රවේශ වීමට හෝ ඒ වෙනුවෙන් ක්‍රියා කිරීමට නොහැක.",
        "අපි ඔබේ පුද්ගලික දත්ත විකුණන්නේ නැත; ප්‍රචාරකයන් සමඟ බෙදාගන්නේද නැත. නීතියෙන් අවශ්‍ය වූ විට, අපගේ කොන්දේසි බලාත්මක කිරීමට, නැතහොත් අපගේ පරිශීලකයන්ගේ අයිතිවාසිකම් සහ ආරක්ෂාව රැකීමට දත්ත හෙළි කළ හැක.",
      ],
    },
    {
      heading: "7. Cookies",
      body: [
        "අපි භාවිතා කරන්නේ පළමු-පාර්ශ්වීය cookies කිහිපයක් පමණි: ඔබව පිවිසී තබන සැසි cookie එකක් (අත්සන් කළ token එකක්), සහ ඔබේ භාෂාව සහ තේමාව මතක තබාගන්නා මනාප cookies. ප්‍රචාරණ හෝ අඩවි-හරහා ලුහුබැඳීමේ cookies භාවිතා නොකරමු.",
      ],
    },
    {
      heading: "8. දත්ත තබාගන්නා කාලය",
      body: [
        "ඔබේ ගිණුම සක්‍රියව පවතින තාක් ඔබේ දත්ත තබාගනිමු. ඔබ ගිණුම මකන්නේ නම් (ගිණුම → ගිණුම මකන්න), ඔබේ පැතිකඩ, ඡායාරූප, සමාලෝචන, විමසුම්, රැකියා දැන්වීම් සහ ප්‍රතිචාර සේවාවෙන් මැකේ; විගණන සහ අනිසි භාවිත වැළැක්වීමේ අරමුණු සඳහා මැකීම පිළිබඳ අවම වාර්තාවක් (ඔබේ විද්‍යුත් තැපැල් ලිපිනය සහ භූමිකාව) සහ තමන්ගේම කාලසටහනකට ඉකුත් වන කෙටි-කාලීන ආරක්ෂක සටහන් පමණක් රඳවාගනිමු.",
      ],
    },
    {
      heading: "9. ඔබේ අයිතිවාසිකම්",
      body: [
        `PDPA යටතේ, අප සතුව ඇති ඔබේ පුද්ගලික දත්තවලට ප්‍රවේශ වීමට, වැරදි දත්ත නිවැරදි කරගැනීමට, ඔබේ දත්ත මකා දැමීමට, සහ දුන් කැමැත්තක් ඉවත් කරගැනීමට ඔබට අයිතිය ඇත. ඔබේ ගිණුම් සැකසුම් වෙතින් ඔබටම තොරතුරු සංස්කරණය කර ගිණුම මකා දැමිය හැක; ඕනෑම ඉල්ලීමක් සඳහා ${CONTACT_EMAIL} වෙත ලියන්න. ලංකාවේ දත්ත ආරක්ෂණ අධිකාරියට පැමිණිල්ලක්ද ඉදිරිපත් කළ හැක.`,
      ],
    },
    {
      heading: "10. ආරක්ෂාව",
      body: [
        "අපි ඔබේ දත්ත ආරක්ෂා කරන්නේ කර්මාන්ත-සම්මත ක්‍රමවලින්: සංකේතනය කළ සම්බන්ධතා (HTTPS), hash කළ මුරපද, පුද්ගලික ඡායාරූප ගබඩාව, සහ පොදු අන්තර්ජාලයෙන් ළඟා විය නොහැකි අභ්‍යන්තර පද්ධති. කිසිදු අන්තර්ජාල සේවාවක් සම්පූර්ණයෙන් ආරක්ෂිත නොවන බැවින්, ශක්තිමත්, අනන්‍ය මුරපදයක් භාවිතා කරන්න.",
      ],
    },
    {
      heading: "11. ළමයින්",
      body: [
        "Baas.lk ළමයින් සඳහා නොවන අතර, ගිණුමක් තබාගැනීමට ඔබ අවම වශයෙන් වයස අවුරුදු 18ක් විය යුතුය. අපි දැනුවත්ව ළමයින්ගෙන් පුද්ගලික දත්ත එකතු නොකරමු; ළමයෙකු අපට පුද්ගලික දත්ත ලබා දී ඇතැයි සිතන්නේ නම්, අප හා සම්බන්ධ වන්න — අපි ඒවා මකා දමන්නෙමු.",
      ],
    },
    {
      heading: "12. මෙම ප්‍රතිපත්තියේ වෙනස්කම්",
      body: [
        "මෙම ප්‍රතිපත්තිය කලින් කලට යාවත්කාලීන කළ හැක; ඉහත “යාවත්කාලීන කළේ” දිනය වත්මන් අනුවාදය පෙන්වයි. වැදගත් වෙනසක් කරන්නේ නම් අඩවියේ හෝ විද්‍යුත් තැපෑලෙන් දැනුම් දෙන්නෙමු.",
      ],
    },
    {
      heading: "13. සම්බන්ධ වන්න",
      body: [
        `රහස්‍යතාව පිළිබඳ ඕනෑම ප්‍රශ්නයක් හෝ ඉල්ලීමක් සඳහා ${CONTACT_EMAIL} වෙත විද්‍යුත් තැපෑලක් එවන්න.`,
      ],
    },
  ],
};

export const legal: Record<Locale, { terms: LegalDoc; privacy: LegalDoc }> = {
  en: { terms: termsEn, privacy: privacyEn },
  si: { terms: termsSi, privacy: privacySi },
};
