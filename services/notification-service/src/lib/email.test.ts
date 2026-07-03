import { describe, expect, it } from "vitest";
import { jobResponseEmail, passwordResetEmail, verifyEmail } from "./email";

describe("verifyEmail", () => {
  it("renders the English template by default", () => {
    const { subject, html } = verifyEmail("https://baas.lk/verify-email?token=abc");
    expect(subject).toBe("Verify your Baas.lk email");
    expect(html).toContain("Confirm your email address");
    expect(html).toContain("Thanks for joining Baas.lk. Please confirm your email address. This link expires in 24 hours.");
    expect(html).toContain(">Verify email</a>");
    expect(html).toContain('href="https://baas.lk/verify-email?token=abc"');
  });

  it("renders the Sinhala template", () => {
    const { subject, html } = verifyEmail("https://baas.lk/verify-email?token=abc", "si");
    expect(subject).toBe("ඔබේ Baas.lk විද්‍යුත් තැපෑල තහවුරු කරන්න");
    expect(html).toContain("ඔබේ විද්‍යුත් තැපැල් ලිපිනය තහවුරු කරන්න");
    expect(html).toContain("මෙම සබැඳිය පැය 24කින් කල් ඉකුත් වේ");
    expect(html).toContain(">විද්‍යුත් තැපෑල තහවුරු කරන්න</a>");
    expect(html).toContain('href="https://baas.lk/verify-email?token=abc"');
  });
});

describe("passwordResetEmail", () => {
  it("renders the English template by default", () => {
    const { subject, html } = passwordResetEmail("https://baas.lk/reset?token=xyz");
    expect(subject).toBe("Reset your Baas.lk password");
    expect(html).toContain("Reset your password");
    expect(html).toContain("This link expires in 1 hour.");
    expect(html).toContain(">Reset password</a>");
    expect(html).toContain('href="https://baas.lk/reset?token=xyz"');
  });

  it("renders the Sinhala template", () => {
    const { subject, html } = passwordResetEmail("https://baas.lk/reset?token=xyz", "si");
    expect(subject).toBe("ඔබේ Baas.lk මුරපදය යළි සකසන්න");
    expect(html).toContain("ඔබේ මුරපදය යළි සකසන්න");
    expect(html).toContain("මෙම සබැඳිය පැය 1කින් කල් ඉකුත් වේ");
    expect(html).toContain(">මුරපදය යළි සකසන්න</a>");
    expect(html).toContain('href="https://baas.lk/reset?token=xyz"');
  });
});

describe("jobResponseEmail", () => {
  it("renders the English template by default", () => {
    const { subject, html } = jobResponseEmail(
      "https://baas.lk/jobs",
      "Nimal Perera",
      "Fix a leaking tap"
    );
    expect(subject).toBe("Nimal Perera responded to your job");
    expect(html).toContain("New response to your job");
    expect(html).toContain(
      'Nimal Perera responded to your job "Fix a leaking tap". View their message and contact details.'
    );
    expect(html).toContain(">View response</a>");
    expect(html).toContain('href="https://baas.lk/jobs"');
  });

  it("renders the Sinhala template", () => {
    const { subject, html } = jobResponseEmail(
      "https://baas.lk/jobs",
      "Nimal Perera",
      "Fix a leaking tap",
      "si"
    );
    expect(subject).toBe("Nimal Perera ඔබේ රැකියාවට ප්‍රතිචාර දැක්වීය");
    expect(html).toContain("ඔබේ රැකියාවට නව ප්‍රතිචාරයක්");
    expect(html).toContain(
      'Nimal Perera ඔබේ "Fix a leaking tap" රැකියාවට ප්‍රතිචාර දැක්වීය. ඔවුන්ගේ පණිවිඩය සහ සම්බන්ධතා විස්තර බලන්න.'
    );
    expect(html).toContain(">ප්‍රතිචාරය බලන්න</a>");
    expect(html).toContain('href="https://baas.lk/jobs"');
  });
});
