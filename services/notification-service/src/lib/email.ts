// Email templates (en/si) and sender, ported verbatim from the monolith's
// src/lib/email.ts. The notification-service is stateless: it owns these
// templates and nothing else.
import { Resend } from "resend";

export type Locale = "en" | "si";

const FROM = process.env.EMAIL_FROM ?? "Baas.lk <onboarding@resend.dev>";

type SendArgs = { to: string; subject: string; html: string };

// Dev SMTP transport (Mailpit, #673). When SMTP_URL is set, mail is sent over
// SMTP instead of Resend — so the `docker compose` dev stack captures every
// EN/SI email in Mailpit's web UI (http://localhost:8025) with no Resend
// account. Production leaves SMTP_URL unset and keeps using Resend. nodemailer
// is imported dynamically so it is only loaded when SMTP is actually configured
// (prod images never touch it).
async function sendViaSmtp({ to, subject, html }: SendArgs, url: string) {
  const { createTransport } = await import("nodemailer");
  const transport = createTransport(url);
  await transport.sendMail({ from: FROM, to, subject, html });
  return { delivered: true as const };
}

// Delivery precedence: SMTP (dev/Mailpit) → Resend (prod) → console fallback.
// With none configured it logs the full message to the server console so the
// whole flow works in local development without any account.
export async function sendMail({ to, subject, html }: SendArgs) {
  const smtpUrl = process.env.SMTP_URL;
  if (smtpUrl) {
    return sendViaSmtp({ to, subject, html }, smtpUrl);
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(
      `\n[email:dev] no SMTP_URL or RESEND_API_KEY set — not sending.\n  to: ${to}\n  subject: ${subject}\n  html:\n${html}\n`
    );
    return { delivered: false as const };
  }
  const resend = new Resend(key);
  const { error } = await resend.emails.send({ from: FROM, to, subject, html });
  if (error) throw new Error(error.message);
  return { delivered: true as const };
}

// Escape untrusted values before embedding them in the HTML email body.
// Inquiry submitter names, provider display names and job titles are all
// user-controlled and reach these templates verbatim — without this they can
// inject markup/phishing anchors into a legitimate Baas.lk email.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// The action URL is derived from the gateway's x-origin header; validate the
// scheme (defence-in-depth against a spoofed/poisoned origin) and entity-encode
// it so it cannot break out of the href attribute.
function safeUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") return escapeHtml(url);
  } catch {
    // fall through
  }
  return "#";
}

// `heading`/`body` are composed from static template strings plus values that
// callers MUST pre-escape (see escapeHtml). `url` is made safe here.
function layout(heading: string, body: string, buttonLabel: string, url: string) {
  const href = safeUrl(url);
  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="font-size:20px;font-weight:700;margin-bottom:16px">Baas<span style="color:#8f3a1c">.lk</span></div>
  <h1 style="font-size:18px;margin:0 0 12px">${heading}</h1>
  <p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 20px">${body}</p>
  <a href="${href}" style="display:inline-block;background:#8f3a1c;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 20px;border-radius:9999px">${buttonLabel}</a>
  <p style="font-size:12px;color:#94a3b8;margin:24px 0 0;line-height:1.6">If the button does not work, copy this link into your browser:<br>${href}</p>
</div>`;
}

const T: Record<
  Locale,
  {
    resetSubject: string;
    resetHeading: string;
    resetBody: string;
    resetButton: string;
    verifySubject: string;
    verifyHeading: string;
    verifyBody: string;
    verifyButton: string;
    changeSubject: string;
    changeHeading: string;
    changeBody: string;
    changeButton: string;
    existsSubject: string;
    existsHeading: string;
    existsBody: string;
    existsButton: string;
    attemptSubject: string;
    attemptHeading: string;
    attemptBody: string;
    attemptButton: string;
  }
> = {
  en: {
    resetSubject: "Reset your Baas.lk password",
    resetHeading: "Reset your password",
    resetBody:
      "We received a request to reset your password. This link expires in 1 hour. If you did not request this, you can safely ignore this email.",
    resetButton: "Reset password",
    verifySubject: "Verify your Baas.lk email",
    verifyHeading: "Confirm your email address",
    verifyBody:
      "Thanks for joining Baas.lk. Please confirm your email address. This link expires in 24 hours.",
    verifyButton: "Verify email",
    changeSubject: "Confirm your new Baas.lk email",
    changeHeading: "Confirm your new email address",
    changeBody:
      "We received a request to change the email address on your Baas.lk account to this one. Confirm to complete the change. This link expires in 1 hour. If you did not request this, you can safely ignore this email — your address will not change.",
    changeButton: "Confirm new email",
    existsSubject: "You already have a Baas.lk account",
    existsHeading: "You already have an account",
    existsBody:
      "Someone tried to sign up for Baas.lk with this email address, but an account already exists. If it was you, sign in below — or reset your password if you have forgotten it. If it was not you, you can safely ignore this email; no new account was created and nothing has changed.",
    existsButton: "Sign in",
    attemptSubject: "Someone tried to use your Baas.lk email",
    attemptHeading: "A change-email request used your address",
    attemptBody:
      "Someone tried to change the email address on a Baas.lk account to this one. If it was you, sign in and start the change from your account settings. If it was not you, you can safely ignore this email — nothing has changed and your account is unaffected.",
    attemptButton: "Sign in",
  },
  si: {
    resetSubject: "ඔබේ Baas.lk මුරපදය යළි සකසන්න",
    resetHeading: "ඔබේ මුරපදය යළි සකසන්න",
    resetBody:
      "ඔබේ මුරපදය යළි සැකසීමට ඉල්ලීමක් ලැබුණා. මෙම සබැඳිය පැය 1කින් කල් ඉකුත් වේ. ඔබ මෙය ඉල්ලා නොමැති නම්, මෙම විද්‍යුත් තැපෑල නොසලකා හැරිය හැක.",
    resetButton: "මුරපදය යළි සකසන්න",
    verifySubject: "ඔබේ Baas.lk විද්‍යුත් තැපෑල තහවුරු කරන්න",
    verifyHeading: "ඔබේ විද්‍යුත් තැපැල් ලිපිනය තහවුරු කරන්න",
    verifyBody:
      "Baas.lk හා එක්වීම ගැන ස්තූතියි. කරුණාකර ඔබේ විද්‍යුත් තැපැල් ලිපිනය තහවුරු කරන්න. මෙම සබැඳිය පැය 24කින් කල් ඉකුත් වේ.",
    verifyButton: "විද්‍යුත් තැපෑල තහවුරු කරන්න",
    changeSubject: "ඔබේ නව Baas.lk විද්‍යුත් තැපෑල තහවුරු කරන්න",
    changeHeading: "ඔබේ නව විද්‍යුත් තැපැල් ලිපිනය තහවුරු කරන්න",
    changeBody:
      "ඔබේ Baas.lk ගිණුමේ විද්‍යුත් තැපැල් ලිපිනය මෙයට වෙනස් කිරීමට ඉල්ලීමක් ලැබුණා. වෙනස්කම සම්පූර්ණ කිරීමට තහවුරු කරන්න. මෙම සබැඳිය පැය 1කින් කල් ඉකුත් වේ. ඔබ මෙය ඉල්ලා නොමැති නම්, මෙම විද්‍යුත් තැපෑල නොසලකා හැරිය හැක — ඔබේ ලිපිනය වෙනස් නොවේ.",
    changeButton: "නව විද්‍යුත් තැපෑල තහවුරු කරන්න",
    existsSubject: "ඔබට දැනටමත් Baas.lk ගිණුමක් ඇත",
    existsHeading: "ඔබට දැනටමත් ගිණුමක් ඇත",
    existsBody:
      "යමෙකු මෙම විද්‍යුත් තැපැල් ලිපිනය සමඟ Baas.lk සඳහා ලියාපදිංචි වීමට උත්සාහ කළ නමුත්, දැනටමත් ගිණුමක් පවතී. එය ඔබ නම්, පහතින් පිවිසෙන්න — නැතහොත් මුරපදය අමතක වී ඇත්නම් එය යළි සකසන්න. එය ඔබ නොවේ නම්, මෙම විද්‍යුත් තැපෑල නොසලකා හැරිය හැක; නව ගිණුමක් සෑදී නැත, කිසිවක් වෙනස් වී නැත.",
    existsButton: "පිවිසෙන්න",
    attemptSubject: "යමෙකු ඔබේ Baas.lk විද්‍යුත් තැපෑල භාවිතා කිරීමට උත්සාහ කළා",
    attemptHeading: "විද්‍යුත් තැපෑල වෙනස් කිරීමේ ඉල්ලීමක් ඔබේ ලිපිනය භාවිතා කළා",
    attemptBody:
      "යමෙකු Baas.lk ගිණුමක විද්‍යුත් තැපැල් ලිපිනය මෙයට වෙනස් කිරීමට උත්සාහ කළා. එය ඔබ නම්, පිවිස ඔබේ ගිණුම් සැකසුම් තුළින් වෙනස්කම ආරම්භ කරන්න. එය ඔබ නොවේ නම්, මෙම විද්‍යුත් තැපෑල නොසලකා හැරිය හැක — කිසිවක් වෙනස් වී නැත, ඔබේ ගිණුමට බලපෑමක් නැත.",
    attemptButton: "පිවිසෙන්න",
  },
};

export function passwordResetEmail(url: string, locale: Locale = "en") {
  const t = T[locale] ?? T.en;
  return {
    subject: t.resetSubject,
    html: layout(t.resetHeading, t.resetBody, t.resetButton, url),
  };
}

export function verifyEmail(url: string, locale: Locale = "en") {
  const t = T[locale] ?? T.en;
  return {
    subject: t.verifySubject,
    html: layout(t.verifyHeading, t.verifyBody, t.verifyButton, url),
  };
}

export function changeEmail(url: string, locale: Locale = "en") {
  const t = T[locale] ?? T.en;
  return {
    subject: t.changeSubject,
    html: layout(t.changeHeading, t.changeBody, t.changeButton, url),
  };
}

// Account-already-exists (#373): sent when someone tries to register an email
// that already has an account. Registration returns the same generic success
// either way (anti-enumeration), so this out-of-band mail is how a genuine
// owner learns of the attempt and is nudged to sign in / reset. `url` points at
// the sign-in page.
export function accountExistsEmail(url: string, locale: Locale = "en") {
  const t = T[locale] ?? T.en;
  return {
    subject: t.existsSubject,
    html: layout(t.existsHeading, t.existsBody, t.existsButton, url),
  };
}

// Change-email attempt on a taken address (#503): the change-email endpoint
// returns the same generic success whether or not the target address is already
// registered (anti-enumeration), so this out-of-band mail is how the genuine
// owner of a taken address learns someone tried to move an account onto it.
// `url` points at the sign-in page.
export function emailChangeAttemptEmail(url: string, locale: Locale = "en") {
  const t = T[locale] ?? T.en;
  return {
    subject: t.attemptSubject,
    html: layout(t.attemptHeading, t.attemptBody, t.attemptButton, url),
  };
}

export function inquiryEmail(
  url: string,
  customerName: string,
  locale: Locale = "en"
) {
  const si = locale === "si";
  // Subject is a plain-text header (Resend JSON API) — keep it raw; the HTML
  // body must use the escaped name.
  const name = escapeHtml(customerName);
  return {
    subject: si
      ? `${customerName} ඔබට නව විමසීමක් එවා ඇත`
      : `New inquiry from ${customerName}`,
    html: layout(
      si ? "ඔබට නව විමසීමක්" : "You have a new inquiry",
      si
        ? `${name} ඔබේ Baas.lk පැතිකඩ හරහා විමසීමක් එවා ඇත. ඔවුන්ගේ පණිවිඩය සහ සම්බන්ධතා විස්තර බැලීමට ඔබේ උපකරණ පුවරුවට පිවිසෙන්න.`
        : `${name} sent you an inquiry through your Baas.lk profile. Log in to your dashboard to view their message and contact details.`,
      si ? "විමසීම බලන්න" : "View inquiry",
      url
    ),
  };
}

// New-matching-job alert (#501): sent to every provider whose category +
// district match a freshly posted job, so the lead-gen loop reaches them
// instead of relying on them to browse the board. Mirrors jobResponseEmail's
// bilingual structure; `jobTitle` is user-controlled and escaped for the body
// (the subject is a plain-text header, so `district` is used raw there).
export function newJobEmail(
  url: string,
  jobTitle: string,
  district: string,
  locale: Locale = "en"
) {
  const si = locale === "si";
  const title = escapeHtml(jobTitle);
  const area = escapeHtml(district);
  return {
    subject: si
      ? `${district} හි ඔබට ගැලපෙන නව රැකියාවක්`
      : `New job in ${district} matching your services`,
    html: layout(
      si ? "ඔබට ගැලපෙන නව රැකියාවක්" : "A new job matches your services",
      si
        ? `ඔබේ ප්‍රවර්ගයට සහ ${area} දිස්ත්‍රික්කයට ගැලපෙන "${title}" නමින් නව රැකියාවක් පළ කර ඇත. එය බලා ප්‍රතිචාර දැක්වීමට ඔබේ රැකියා පුවරුවට පිවිසෙන්න.`
        : `A new job "${title}" was posted in ${area} matching your category. Log in to your job board to view it and respond.`,
      si ? "රැකියාව බලන්න" : "View job",
      url
    ),
  };
}

// Saved-search new-match alert (#516): sent to customers whose saved search
// matches a newly published provider — the reverse direction of newJobEmail
// above. `providerName`/`district` are user-controlled and escaped for the
// body; the subject is a plain-text header so the raw values are used there.
export function newProviderMatchEmail(
  url: string,
  providerName: string,
  district: string,
  locale: Locale = "en"
) {
  const si = locale === "si";
  const name = escapeHtml(providerName);
  const area = escapeHtml(district);
  return {
    subject: si
      ? `ඔබේ සුරැකි සෙවුමට ගැලපෙන නව වෘත්තිකයෙක්`
      : `New professional matching your saved search`,
    html: layout(
      si ? "ඔබේ සුරැකි සෙවුමට නව ගැලපීමක්" : "A new match for your saved search",
      si
        ? `${area} දිස්ත්‍රික්කයේ ${name} Baas.lk හා අලුතින් එක් වූ අතර ඔබේ සුරැකි සෙවුමකට ගැලපේ. ඔවුන්ගේ පැතිකඩ, සේවා සහ ගාස්තු බලන්න.`
        : `${name} in ${area} just joined Baas.lk and matches one of your saved searches. Take a look at their profile, services and rates.`,
      si ? "පැතිකඩ බලන්න" : "View profile",
      url
    ),
  };
}

// Thread-reply notification (#393, RFC stateful-notification-service): sent to
// the OTHER party of an inquiry thread when a new message lands. `senderName`
// is user-controlled and escaped for the body; the subject is a plain-text
// header so the raw value is used there (same convention as inquiryEmail).
export function threadReplyEmail(
  url: string,
  senderName: string,
  locale: Locale = "en"
) {
  const si = locale === "si";
  const name = escapeHtml(senderName);
  return {
    subject: si
      ? `${senderName} ගෙන් නව පණිවිඩයක්`
      : `New message from ${senderName}`,
    html: layout(
      si ? "ඔබට නව පණිවිඩයක්" : "You have a new message",
      si
        ? `${name} ඔබේ Baas.lk විමසීම් සංවාදයට නව පණිවිඩයක් එවා ඇත. එය කියවා පිළිතුරු දීමට පිවිසෙන්න.`
        : `${name} sent a new message in your inquiry conversation on Baas.lk. Log in to read and reply.`,
      si ? "පණිවිඩය බලන්න" : "View message",
      url
    ),
  };
}

// New-review notification (#393): sent to the reviewed profile's owner when a
// review is published. `reviewerName` is user-controlled and escaped for the
// body; `rating` is validated 1–5 upstream.
export function newReviewEmail(
  url: string,
  reviewerName: string,
  rating: number,
  locale: Locale = "en"
) {
  const si = locale === "si";
  const name = escapeHtml(reviewerName);
  return {
    subject: si
      ? `${reviewerName} ඔබේ පැතිකඩට සමාලෝචනයක් තැබීය`
      : `${reviewerName} left a review on your profile`,
    html: layout(
      si ? "ඔබට නව සමාලෝචනයක්" : "You have a new review",
      si
        ? `${name} ඔබේ Baas.lk පැතිකඩට තරු ${rating}ක සමාලෝචනයක් තැබීය. එය කියවා ප්‍රසිද්ධ පිළිතුරක් පළ කිරීමට පිවිසෙන්න.`
        : `${name} left a ${rating}-star review on your Baas.lk profile. Log in to read it and post a public reply.`,
      si ? "සමාලෝචනය බලන්න" : "View review",
      url
    ),
  };
}

// Review-response notification (RFC): sent to a review's author when the
// reviewed provider posts a public reply. `providerName` is user-controlled
// and escaped for the body.
export function reviewResponseEmail(
  url: string,
  providerName: string,
  locale: Locale = "en"
) {
  const si = locale === "si";
  const name = escapeHtml(providerName);
  return {
    subject: si
      ? `${providerName} ඔබේ සමාලෝචනයට පිළිතුරු දුන්නා`
      : `${providerName} replied to your review`,
    html: layout(
      si ? "ඔබේ සමාලෝචනයට පිළිතුරක්" : "A reply to your review",
      si
        ? `${name} ඔබ Baas.lk හි තැබූ සමාලෝචනයට ප්‍රසිද්ධ පිළිතුරක් පළ කර ඇත. ඔවුන් පැවසූ දේ බලන්න.`
        : `${name} posted a public reply to the review you left on Baas.lk. Take a look at what they said.`,
      si ? "පිළිතුර බලන්න" : "View reply",
      url
    ),
  };
}

// Verification decision notifications (#393): static bilingual bodies, no
// user-controlled values (the rejection reason is shown in-app, not embedded
// in the email).
export function verificationApprovedEmail(url: string, locale: Locale = "en") {
  const si = locale === "si";
  return {
    subject: si
      ? "ඔබේ Baas.lk තහවුරු කිරීම අනුමත විය"
      : "Your Baas.lk verification was approved",
    html: layout(
      si ? "ඔබ තහවුරු වී ඇත" : "You're verified",
      si
        ? "ඔබේ තහවුරු කිරීමේ ලේඛන අනුමත විය — ඔබේ පැතිකඩෙහි දැන් තහවුරු කළ ලාංඡනය පෙන්වයි. එය ඔබේ සේවාවන් කෙරෙහි ගනුදෙනුකරුවන්ගේ විශ්වාසය වැඩි කරයි."
        : "Your verification documents were approved — your profile now shows the verified badge, which helps customers trust your services.",
      si ? "ඔබේ පැතිකඩ බලන්න" : "View your profile",
      url
    ),
  };
}

export function verificationRejectedEmail(url: string, locale: Locale = "en") {
  const si = locale === "si";
  return {
    subject: si
      ? "ඔබේ Baas.lk තහවුරු කිරීම අනුමත නොවීය"
      : "Your Baas.lk verification was not approved",
    html: layout(
      si ? "තහවුරු කිරීම අනුමත නොවීය" : "Verification not approved",
      si
        ? "මෙවර ඔබේ තහවුරු කිරීමේ ලේඛන අනුමත කළ නොහැකි විය. හේතුව බලා නැවත ඉදිරිපත් කිරීමට ඔබේ උපකරණ පුවරුවට පිවිසෙන්න."
        : "We couldn't approve your verification documents this time. Log in to your dashboard to see the reason and resubmit.",
      si ? "උපකරණ පුවරුවට යන්න" : "Go to dashboard",
      url
    ),
  };
}

export function jobResponseEmail(
  url: string,
  providerName: string,
  jobTitle: string,
  locale: Locale = "en"
) {
  const si = locale === "si";
  const name = escapeHtml(providerName);
  const title = escapeHtml(jobTitle);
  return {
    subject: si
      ? `${providerName} ඔබේ රැකියාවට ප්‍රතිචාර දැක්වීය`
      : `${providerName} responded to your job`,
    html: layout(
      si ? "ඔබේ රැකියාවට නව ප්‍රතිචාරයක්" : "New response to your job",
      si
        ? `${name} ඔබේ "${title}" රැකියාවට ප්‍රතිචාර දැක්වීය. ඔවුන්ගේ පණිවිඩය සහ සම්බන්ධතා විස්තර බලන්න.`
        : `${name} responded to your job "${title}". View their message and contact details.`,
      si ? "ප්‍රතිචාරය බලන්න" : "View response",
      url
    ),
  };
}
