import { describe, expect, it } from "vitest";
import { accountExistsEmail, escapeHtml, inquiryEmail, jobResponseEmail, newJobEmail, passwordResetEmail, verifyEmail } from "./email";

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

describe("accountExistsEmail", () => {
  it("renders the English template by default", () => {
    const { subject, html } = accountExistsEmail("https://baas.lk/login");
    expect(subject).toBe("You already have a Baas.lk account");
    expect(html).toContain("You already have an account");
    expect(html).toContain(
      "Someone tried to sign up for Baas.lk with this email address, but an account already exists."
    );
    expect(html).toContain(">Sign in</a>");
    expect(html).toContain('href="https://baas.lk/login"');
  });

  it("renders the Sinhala template", () => {
    const { subject, html } = accountExistsEmail("https://baas.lk/login", "si");
    expect(subject).toBe("ඔබට දැනටමත් Baas.lk ගිණුමක් ඇත");
    expect(html).toContain("ඔබට දැනටමත් ගිණුමක් ඇත");
    expect(html).toContain("නව ගිණුමක් සෑදී නැත");
    expect(html).toContain(">පිවිසෙන්න</a>");
    expect(html).toContain('href="https://baas.lk/login"');
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

describe("newJobEmail", () => {
  it("renders the English template by default", () => {
    const { subject, html } = newJobEmail(
      "https://baas.lk/jobs",
      "Fix a leaking tap",
      "Colombo"
    );
    expect(subject).toBe("New job in Colombo matching your services");
    expect(html).toContain("A new job matches your services");
    expect(html).toContain(
      'A new job "Fix a leaking tap" was posted in Colombo matching your category. Log in to your job board to view it and respond.'
    );
    expect(html).toContain(">View job</a>");
    expect(html).toContain('href="https://baas.lk/jobs"');
  });

  it("renders the Sinhala template", () => {
    const { subject, html } = newJobEmail(
      "https://baas.lk/jobs",
      "Fix a leaking tap",
      "Colombo",
      "si"
    );
    expect(subject).toBe("Colombo හි ඔබට ගැලපෙන නව රැකියාවක්");
    expect(html).toContain("ඔබට ගැලපෙන නව රැකියාවක්");
    expect(html).toContain(">රැකියාව බලන්න</a>");
    expect(html).toContain('href="https://baas.lk/jobs"');
  });

  it("escapes markup in the job title", () => {
    const { html } = newJobEmail(
      "https://baas.lk/jobs",
      "</p><script>steal()</script>",
      "Colombo"
    );
    expect(html).not.toContain("<script>steal()</script>");
    expect(html).toContain("&lt;script&gt;steal()&lt;/script&gt;");
  });
});

describe("inquiryEmail", () => {
  it("renders the English template by default", () => {
    const { subject, html } = inquiryEmail("https://baas.lk/dashboard", "Dilani Fernando");
    expect(subject).toBe("New inquiry from Dilani Fernando");
    expect(html).toContain("You have a new inquiry");
    expect(html).toContain("Dilani Fernando sent you an inquiry through your Baas.lk profile.");
    expect(html).toContain(">View inquiry</a>");
    expect(html).toContain('href="https://baas.lk/dashboard"');
  });

  it("renders the Sinhala template", () => {
    const { subject, html } = inquiryEmail("https://baas.lk/dashboard", "Dilani Fernando", "si");
    expect(subject).toBe("Dilani Fernando ඔබට නව විමසීමක් එවා ඇත");
    expect(html).toContain("ඔබට නව විමසීමක්");
    expect(html).toContain(">විමසීම බලන්න</a>");
    expect(html).toContain('href="https://baas.lk/dashboard"');
  });
});

describe("HTML injection protection", () => {
  it("escapes markup in the inquiry submitter name", () => {
    const { html } = inquiryEmail(
      "https://baas.lk/dashboard",
      '<a href="https://phish.example">Confirm account</a>'
    );
    // The raw anchor must never reach the body.
    expect(html).not.toContain('<a href="https://phish.example">Confirm account</a>');
    expect(html).toContain("&lt;a href=&quot;https://phish.example&quot;&gt;Confirm account&lt;/a&gt;");
  });

  it("escapes markup in the provider name and job title", () => {
    const { html } = jobResponseEmail(
      "https://baas.lk/jobs",
      "<img src=x onerror=alert(1)>",
      "</p><script>steal()</script>"
    );
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).not.toContain("<script>steal()</script>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;script&gt;steal()&lt;/script&gt;");
  });

  it("neutralises a non-http action url", () => {
    const { html } = passwordResetEmail("javascript:alert(document.cookie)");
    expect(html).not.toContain("javascript:alert");
    expect(html).toContain('href="#"');
  });

  it("entity-encodes a url that tries to break out of the href attribute", () => {
    const { html } = verifyEmail('https://baas.lk/verify"><script>x</script>');
    expect(html).not.toContain('"><script>x</script>');
    // URL parsing keeps it an http(s) url; the quote/angle brackets are encoded.
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("escapeHtml handles all five entities", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});
