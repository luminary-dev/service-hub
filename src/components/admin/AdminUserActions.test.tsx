// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import AdminUserActions from "./AdminUserActions";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

const t = dict.en.admin;
const fetchMock = vi.fn();

function renderActions(
  props: Partial<React.ComponentProps<typeof AdminUserActions>> = {}
) {
  return render(
    <AdminUserActions userId="user_1" role="CUSTOMER" locked={false} {...props} />
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

describe("AdminUserActions", () => {
  it("PATCHes a new role when the select changes", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderActions();
    fireEvent.change(screen.getByLabelText(t.usersRole), {
      target: { value: "PROVIDER" },
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/users/user_1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "PROVIDER" }),
    });
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it("locks an unlocked account and unlocks a locked one", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const { rerender } = renderActions({ locked: false });
    fireEvent.click(screen.getByRole("button", { name: t.lock }));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/admin/users/user_1",
      expect.objectContaining({ body: JSON.stringify({ action: "lock" }) })
    );
    // The controls disable while pending; wait for the first request to settle.
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    rerender(<AdminUserActions userId="user_1" role="CUSTOMER" locked />);
    fireEvent.click(screen.getByRole("button", { name: t.unlock }));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/admin/users/user_1",
      expect.objectContaining({ body: JSON.stringify({ action: "unlock" }) })
    );
  });

  it("posts to the force-logout endpoint", () => {
    fetchMock.mockResolvedValue({ ok: true });
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: t.forceLogout }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/users/user_1/force-logout",
      { method: "POST" }
    );
  });
});
