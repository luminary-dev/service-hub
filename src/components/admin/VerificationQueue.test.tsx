// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { dict } from "@/lib/i18n";
import { ToastProvider } from "../ToastProvider";
import VerificationQueue, { type PendingVerification } from "./VerificationQueue";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

const t = dict.en;
const fetchMock = vi.fn();

const items: PendingVerification[] = [
  {
    id: "prov_1",
    category: "PLUMBING",
    city: "Colombo",
    avatarUrl: null,
    updatedAt: "2026-07-01T00:00:00.000Z",
    user: { name: "Nimal Perera", email: "nimal@example.com" },
    verificationDocs: [],
  },
];

function renderQueue(role: string) {
  return render(
    <ToastProvider>
      <VerificationQueue items={items} role={role} />
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

describe("VerificationQueue", () => {
  it("enables the bulk actions for ADMIN once something is selected", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderQueue("ADMIN");

    fireEvent.click(screen.getByRole("checkbox", { name: t.admin.selectOne }));
    const approve = screen.getByRole("button", {
      name: t.admin.approveSelected,
    }) as HTMLButtonElement;
    expect(approve.disabled).toBe(false);
    expect(approve.title).toBe("");

    fireEvent.click(approve);
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/verifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ["prov_1"], action: "approve" }),
    });
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it("disables bulk and per-row actions for SUPPORT with an explanatory title", async () => {
    const { container } = renderQueue("SUPPORT");

    // Selection still works (the queue is readable), but every action is off.
    fireEvent.click(screen.getByRole("checkbox", { name: t.admin.selectOne }));
    for (const name of [
      t.admin.approveSelected,
      t.admin.rejectSelected,
      t.admin.approve,
      t.admin.reject,
    ]) {
      const button = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(button.title).toBe(t.admin.insufficientPermissions);
      fireEvent.click(button);
    }
    expect(fetchMock).not.toHaveBeenCalled();

    // color-contrast needs a layout engine jsdom lacks (see a11y.test.tsx).
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    const severe = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    );
    expect(severe).toEqual([]);
  }, 30_000);
});
