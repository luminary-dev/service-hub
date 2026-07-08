// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import FilterBar from "./FilterBar";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const t = dict.en;

function renderBar(overrides: Partial<React.ComponentProps<typeof FilterBar>> = {}) {
  return render(
    <FilterBar
      q=""
      category=""
      district=""
      sort="recommended"
      {...overrides}
    />
  );
}

afterEach(() => {
  cleanup();
  push.mockReset();
});

describe("FilterBar", () => {
  it("applies the free-text query on submit", () => {
    const { container } = renderBar();
    fireEvent.change(screen.getByLabelText(t.browse.searchPh), {
      target: { value: "plumber" },
    });
    fireEvent.submit(container.querySelector("form")!);

    const dest = push.mock.calls.at(-1)![0] as string;
    expect(dest).toContain("/providers?");
    expect(dest).toContain("q=plumber");
  });

  it("navigates immediately when the category changes", () => {
    renderBar();
    fireEvent.change(screen.getByLabelText(t.search.allCategories), {
      target: { value: "electrician" },
    });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toContain("category=electrician");
  });

  it("adds the availableOnly flag when the checkbox is ticked", () => {
    renderBar();
    fireEvent.click(screen.getByLabelText(t.browse.availableOnly));
    expect(push.mock.calls[0][0]).toContain("availableOnly=1");
  });

  it("passes a non-default sort through as a query param", () => {
    renderBar();
    const sort = screen.getByLabelText(t.browse.sortLabel);
    fireEvent.change(sort, { target: { value: "rating" } });
    expect(push.mock.calls[0][0]).toContain("sort=rating");
  });

  it("keeps the recommended sort out of the URL", () => {
    renderBar({ category: "plumber" });
    // Re-selecting the default sort should not add a sort param.
    fireEvent.change(screen.getByLabelText(t.browse.sortLabel), {
      target: { value: "recommended" },
    });
    expect(push.mock.calls[0][0]).not.toContain("sort=");
  });
});
