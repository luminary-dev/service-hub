// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import { ToastProvider } from "../ToastProvider";
import JobStatusToggle from "./JobStatusToggle";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

const t = dict.en;
const fetchMock = vi.fn();

function renderToggle(status = "OPEN") {
  return render(
    <ToastProvider>
      <JobStatusToggle jobId="job_1" status={status} />
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  refresh.mockReset();
});

describe("JobStatusToggle", () => {
  it("PATCHes the opposite status and refreshes on success", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderToggle("OPEN");
    fireEvent.click(screen.getByRole("button", { name: t.jobs.close }));

    expect(fetchMock).toHaveBeenCalledWith("/api/jobs/job_1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CLOSED" }),
    });
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it("toasts an error and does not refresh on failure", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    renderToggle("CLOSED");
    fireEvent.click(screen.getByRole("button", { name: t.jobs.reopen }));

    const toast = await screen.findByRole("alert");
    expect(toast.textContent).toContain(t.toast.jobStatusError);
    expect(refresh).not.toHaveBeenCalled();
  });
});
