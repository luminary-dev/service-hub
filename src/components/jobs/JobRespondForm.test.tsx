// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import JobRespondForm from "./JobRespondForm";

const t = dict.en.jobs;
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("JobRespondForm", () => {
  it("reveals the form only after the respond button is clicked", () => {
    render(<JobRespondForm jobId="job_1" />);
    expect(screen.queryByLabelText(t.respondPh)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: t.respond }));
    const field = screen.getByLabelText(t.respondPh) as HTMLTextAreaElement;
    expect(field.required).toBe(true);
    expect(field.minLength).toBe(10);
    expect(field.maxLength).toBe(1000);
  });

  it("posts a trimmed response and shows an announced, focused confirmation on success", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { container } = render(<JobRespondForm jobId="job_1" />);
    fireEvent.click(screen.getByRole("button", { name: t.respond }));
    fireEvent.change(screen.getByLabelText(t.respondPh), {
      target: { value: "  I can help with this today.  " },
    });
    fireEvent.submit(container.querySelector("form")!);

    expect(fetchMock).toHaveBeenCalledWith("/api/jobs/job_1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "I can help with this today." }),
    });

    // The form is replaced by a live-region confirmation (#510)...
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain(t.responseSent);
    // ...that grabs focus so keyboard users aren't dropped on <body>. Focus is
    // moved in a useEffect, so wait for it to flush rather than asserting on the
    // same tick as the render (which flaked under coverage instrumentation).
    const heading = screen.getByText(t.responseSent);
    await waitFor(() => expect(document.activeElement).toBe(heading));
    // The form (and its submit button) is gone.
    expect(screen.queryByLabelText(t.respondPh)).toBeNull();
  });

  it("disables the submit button while sending", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const { container } = render(<JobRespondForm jobId="job_1" />);
    fireEvent.click(screen.getByRole("button", { name: t.respond }));
    fireEvent.change(screen.getByLabelText(t.respondPh), {
      target: { value: "I can help with this today." },
    });
    fireEvent.submit(container.querySelector("form")!);

    const button = screen.getByRole("button", { name: t.sending });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the server error via role=alert", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Job already closed" }),
    });
    const { container } = render(<JobRespondForm jobId="job_1" />);
    fireEvent.click(screen.getByRole("button", { name: t.respond }));
    fireEvent.change(screen.getByLabelText(t.respondPh), {
      target: { value: "I can help with this today." },
    });
    fireEvent.submit(container.querySelector("form")!);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Job already closed");
    // The form stays mounted so the response can be retried.
    expect(screen.getByLabelText(t.respondPh)).toBeTruthy();
  });
});
