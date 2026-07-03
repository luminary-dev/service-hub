import { Resend } from "resend";
import type { Locale } from "./i18n";

const FROM = process.env.EMAIL_FROM ?? "Baas.lk <onboarding@resend.dev>";

type SendArgs = { to: string; subject: string; html: string };

// Sends via Resend when RESEND_API_KEY is set; otherwise logs to the server
// console so the whole flow works in local development without any account.
export async function sendMail({ to, subject, html }: SendArgs) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(
      `\n[email:dev] no RESEND_API_KEY set — not sending.\n  to: ${to}\n  subject: ${subject}\n  html:\n${html}\n`
    );
    return { delivered: false as const };
  }
  const resend = new Resend(key);
  const { error } = await resend.emails.send({ from: FROM, to, subject, html });
  if (error) throw new Error(error.message);
  return { delivered: true as const };
}

function layout(heading: string, body: string, buttonLabel: string, url: string) {
  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="font-size:20px;font-weight:700;margin-bottom:16px">Baas<span style="color:#8f3a1c">.lk</span></div>
  <h1 style="font-size:18px;margin:0 0 12px">${heading}</h1>
  <p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 20px">${body}</p>
  <a href="${url}" style="display:inline-block;background:#8f3a1c;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 20px;border-radius:9999px">${buttonLabel}</a>
  <p style="font-size:12px;color:#94a3b8;margin:24px 0 0;line-height:1.6">If the button does not work, copy this link into your browser:<br>${url}</p>
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

export function jobResponseEmail(
  url: string,
  providerName: string,
  jobTitle: string,
  locale: Locale = "en"
) {
  const si = locale === "si";
  return {
    subject: si
      ? `${providerName} ඔබේ රැකියාවට ප්‍රතිචාර දැක්වීය`
      : `${providerName} responded to your job`,
    html: layout(
      si ? "ඔබේ රැකියාවට නව ප්‍රතිචාරයක්" : "New response to your job",
      si
        ? `${providerName} ඔබේ "${jobTitle}" රැකියාවට ප්‍රතිචාර දැක්වීය. ඔවුන්ගේ පණිවිඩය සහ සම්බන්ධතා විස්තර බලන්න.`
        : `${providerName} responded to your job "${jobTitle}". View their message and contact details.`,
      si ? "ප්‍රතිචාරය බලන්න" : "View response",
      url
    ),
  };
}
