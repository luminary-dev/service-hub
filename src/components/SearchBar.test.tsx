// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import SearchBar from "./SearchBar";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const t = dict.en.search;

function submit(container: HTMLElement) {
  fireEvent.submit(container.querySelector("form")!);
}

afterEach(() => {
  cleanup();
  push.mockReset();
});

describe("SearchBar", () => {
  it("navigates to /providers with a trimmed query and category", () => {
    const { container } = render(<SearchBar />);

    fireEvent.change(screen.getByLabelText(t.placeholder), {
      target: { value: "  wiring  " },
    });
    fireEvent.change(screen.getByLabelText(t.allCategories), {
      target: { value: "electrician" },
    });
    submit(container);

    expect(push).toHaveBeenCalledTimes(1);
    const dest = push.mock.calls[0][0] as string;
    expect(dest).toContain("/providers?");
    expect(dest).toContain("q=wiring");
    expect(dest).toContain("category=electrician");
  });

  it("omits empty params when nothing is entered", () => {
    const { container } = render(<SearchBar />);
    submit(container);

    expect(push).toHaveBeenCalledWith("/providers?");
  });

  it("drops a whitespace-only query", () => {
    const { container } = render(<SearchBar />);
    fireEvent.change(screen.getByLabelText(t.placeholder), {
      target: { value: "   " },
    });
    submit(container);

    expect(push).toHaveBeenCalledWith("/providers?");
  });

  it("renders admin-managed categories passed as a prop (#659)", () => {
    render(
      <SearchBar
        categories={[
          { slug: "welding", labelEn: "Welding", labelSi: "වෑල්ඩින්", icon: null },
        ]}
      />
    );
    // A managed category outside the static seed list shows up in the select.
    const option = screen.getByRole("option", { name: "Welding" });
    expect((option as HTMLOptionElement).value).toBe("welding");
  });
});
