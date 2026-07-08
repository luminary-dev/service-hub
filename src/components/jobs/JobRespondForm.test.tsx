// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import JobRespondForm from "./JobRespondForm";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const t = dict.en.jobs;
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  refresh.mockReset();
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

  it("posts a trimmed response and refreshes on success", async () => {
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
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
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
    expect(refresh).not.toHaveBeenCalled();
  });
});
