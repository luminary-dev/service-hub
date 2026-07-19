// Push rendering for catalog events: a compact bilingual title/body per
// NotificationType, adapted from the email templates in event-email.ts (same
// facts, sentence-length bodies — push has no room for the email's full
// paragraph). Unlike email, EVERY catalog type renders (REPORT_RESOLVED is
// email-less but push follows the in-app channel, which it has). Plain text —
// no HTML, so no escaping (the values are user-controlled but FCM renders
// notification fields as text, never markup).
import type { Locale } from "./email";
import type { NotificationType } from "./events";

// `payload` arrives re-parsed from a queue JSON string, so index it loosely —
// shapes were validated at ingestion (PAYLOAD_SCHEMAS) and deliverPushJob
// wraps rendering in a try/catch (the email worker's posture).
type Payload = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "");

export function renderEventPush(
  type: NotificationType,
  payload: Payload,
  locale: Locale
): { title: string; body: string } {
  const si = locale === "si";
  switch (type) {
    case "NEW_INQUIRY":
      return si
        ? { title: "නව විමසීමක්", body: `${str(payload.customerName)} ඔබට විමසීමක් එවා ඇත.` }
        : { title: "New inquiry", body: `${str(payload.customerName)} sent you an inquiry.` };
    case "THREAD_REPLY":
      return si
        ? { title: "නව පණිවිඩයක්", body: `${str(payload.senderName)} ඔබේ සංවාදයට නව පණිවිඩයක් එවා ඇත.` }
        : { title: "New message", body: `${str(payload.senderName)} sent a new message in your conversation.` };
    case "NEW_REVIEW":
      return si
        ? {
            title: "නව සමාලෝචනයක්",
            body: `${str(payload.reviewerName)} ඔබේ පැතිකඩට තරු ${Number(payload.rating)}ක සමාලෝචනයක් තැබීය.`,
          }
        : {
            title: "New review",
            body: `${str(payload.reviewerName)} left a ${Number(payload.rating)}-star review on your profile.`,
          };
    case "REVIEW_RESPONSE":
      return si
        ? { title: "ඔබේ සමාලෝචනයට පිළිතුරක්", body: `${str(payload.providerName)} ඔබේ සමාලෝචනයට පිළිතුරු දුන්නා.` }
        : { title: "Reply to your review", body: `${str(payload.providerName)} replied to your review.` };
    case "VERIFICATION_APPROVED":
      return si
        ? { title: "ඔබ තහවුරු වී ඇත", body: "ඔබේ තහවුරු කිරීම අනුමත විය — ඔබේ පැතිකඩෙහි දැන් තහවුරු කළ ලාංඡනය පෙන්වයි." }
        : { title: "You're verified", body: "Your verification was approved — your profile now shows the verified badge." };
    case "VERIFICATION_REJECTED":
      return si
        ? { title: "තහවුරු කිරීම අනුමත නොවීය", body: "ඔබේ තහවුරු කිරීමේ ලේඛන අනුමත කළ නොහැකි විය. හේතුව බලා නැවත ඉදිරිපත් කරන්න." }
        : { title: "Verification not approved", body: "We couldn't approve your verification documents. See the reason and resubmit." };
    case "NEW_JOB_MATCH":
      return si
        ? {
            title: "ඔබට ගැලපෙන නව රැකියාවක්",
            body: `${str(payload.district)} හි "${str(payload.jobTitle)}" රැකියාව ඔබේ සේවාවන්ට ගැලපේ.`,
          }
        : {
            title: "New job match",
            body: `New job "${str(payload.jobTitle)}" in ${str(payload.district)} matches your services.`,
          };
    case "JOB_RESPONSE":
      return si
        ? {
            title: "ඔබේ රැකියාවට නව ප්‍රතිචාරයක්",
            body: `${str(payload.providerName)} ඔබේ "${str(payload.jobTitle)}" රැකියාවට ප්‍රතිචාර දැක්වීය.`,
          }
        : {
            title: "New response to your job",
            body: `${str(payload.providerName)} responded to your job "${str(payload.jobTitle)}".`,
          };
    case "SAVED_SEARCH_MATCH":
      return si
        ? {
            title: "සුරැකි සෙවුමට නව ගැලපීමක්",
            body: `${str(payload.district)} හි ${str(payload.providerName)} ඔබේ සුරැකි සෙවුමට ගැලපේ.`,
          }
        : {
            title: "New match for your saved search",
            body: `${str(payload.providerName)} in ${str(payload.district)} matches your saved search.`,
          };
    case "REPORT_RESOLVED": {
      const dismissed = payload.status === "DISMISSED";
      return si
        ? {
            title: "වාර්තාව සමාලෝචනය විය",
            body: dismissed
              ? "ඔබේ වාර්තාව සමාලෝචනය කර ප්‍රතික්ෂේප කරන ලදී."
              : "ඔබේ වාර්තාව සමාලෝචනය කර විසඳන ලදී.",
          }
        : {
            title: "Report reviewed",
            body: dismissed
              ? "Your report was reviewed and dismissed."
              : "Your report was reviewed and resolved.",
          };
    }
  }
}
