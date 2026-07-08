// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import JobPostForm from "./JobPostForm";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const t = dict.en.jobs;
const fetchMock = vi.fn();

function fillRequired() {
  fireEvent.change(screen.getByLabelText(t.jobTitle), {
    target: { value: "Fix leaking pipe" },
  });
  fireEvent.change(screen.getByLabelText(t.category), {
    target: { value: "plumber" },
  });
  fireEvent.change(screen.getByLabelText(t.district), {
    target: { value: "Colombo" },
  });
  fireEvent.change(screen.getByLabelText(t.description), {
    target: { value: "Kitchen sink pipe is leaking badly." },
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  push.mockReset();
  refresh.mockReset();
});

describe("JobPostForm", () => {
  it("enforces required fields and length bounds on the title", () => {
    render(<JobPostForm />);
    const title = screen.getByLabelText(t.jobTitle) as HTMLInputElement;
    expect(title.required).toBe(true);
    expect(title.minLength).toBe(5);
    expect(title.maxLength).toBe(100);
    expect((screen.getByLabelText(t.category) as HTMLSelectElement).required).toBe(
      true
    );
  });

  it("posts the job and redirects to the jobs list on success", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { container } = render(<JobPostForm />);
    fillRequired();
    fireEvent.submit(container.querySelector("form")!);

    expect(fetchMock).toHaveBeenCalledWith("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "plumber",
        district: "Colombo",
        title: "Fix leaking pipe",
        description: "Kitchen sink pipe is leaking badly.",
        budget: null,
      }),
    });
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/jobs"));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("disables the submit button while posting", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const { container } = render(<JobPostForm />);
    fillRequired();
    fireEvent.submit(container.querySelector("form")!);

    const button = screen.getByRole("button", { name: t.posting });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the server error via role=alert", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Budget too low" }),
    });
    const { container } = render(<JobPostForm />);
    fillRequired();
    fireEvent.submit(container.querySelector("form")!);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Budget too low");
    expect(push).not.toHaveBeenCalled();
  });
});
