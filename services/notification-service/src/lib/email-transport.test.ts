import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Transport-selection tests for sendMail (#673 — Mailpit dev SMTP path). The
// template-rendering tests live in email.test.ts; this file mocks the two
// senders and asserts which one sendMail picks for a given env.
const { sendMailMock, createTransport } = vi.hoisted(() => {
  const sendMailMock = vi.fn().mockResolvedValue({ messageId: "test" });
  return {
    sendMailMock,
    createTransport: vi.fn(() => ({ sendMail: sendMailMock })),
  };
});
vi.mock("nodemailer", () => ({ createTransport }));

const { resendSend } = vi.hoisted(() => ({
  resendSend: vi.fn().mockResolvedValue({ error: null }),
}));
// `new Resend(key)` needs a constructable mock (an arrow fn is not), so mock the
// class with a plain class exposing the emails.send spy.
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));

import { sendMail } from "./email";

const MSG = { to: "user@baas.lk", subject: "Hi", html: "<p>x</p>" };

describe("sendMail transport selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SMTP_URL;
    delete process.env.RESEND_API_KEY;
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env.SMTP_URL;
    delete process.env.RESEND_API_KEY;
  });

  it("sends over SMTP when SMTP_URL is set (Mailpit dev path)", async () => {
    process.env.SMTP_URL = "smtp://localhost:1025";
    const res = await sendMail(MSG);
    expect(createTransport).toHaveBeenCalledWith("smtp://localhost:1025");
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: MSG.to, subject: MSG.subject })
    );
    expect(resendSend).not.toHaveBeenCalled();
    expect(res).toEqual({ delivered: true });
  });

  it("prefers SMTP over Resend when both are configured", async () => {
    process.env.SMTP_URL = "smtp://localhost:1025";
    process.env.RESEND_API_KEY = "re_test";
    await sendMail(MSG);
    expect(sendMailMock).toHaveBeenCalledOnce();
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("uses Resend when only RESEND_API_KEY is set", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const res = await sendMail(MSG);
    expect(resendSend).toHaveBeenCalledOnce();
    expect(createTransport).not.toHaveBeenCalled();
    expect(res).toEqual({ delivered: true });
  });

  it("falls back to the console when neither SMTP nor Resend is configured", async () => {
    const res = await sendMail(MSG);
    expect(res).toEqual({ delivered: false });
    expect(createTransport).not.toHaveBeenCalled();
    expect(resendSend).not.toHaveBeenCalled();
  });
});
