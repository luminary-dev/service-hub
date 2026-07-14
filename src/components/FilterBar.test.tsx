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

  it("does not navigate when a select changes until the form is submitted", () => {
    const { container } = renderBar();
    fireEvent.change(screen.getByLabelText(t.search.allCategories), {
      target: { value: "electrician" },
    });
    // Changing the select must not auto-navigate (keyboard a11y, WCAG 3.2.2).
    expect(push).not.toHaveBeenCalled();

    fireEvent.submit(container.querySelector("form")!);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toContain("category=electrician");
  });

  it("carries every select through the Search submit", () => {
    const { container } = renderBar();
    fireEvent.change(screen.getByLabelText(t.search.allCategories), {
      target: { value: "electrician" },
    });
    fireEvent.change(screen.getByLabelText(t.browse.allDistricts), {
      target: { value: "Colombo" },
    });
    fireEvent.change(screen.getByLabelText(t.browse.ratingLabel), {
      target: { value: "4" },
    });
    expect(push).not.toHaveBeenCalled();

    fireEvent.submit(container.querySelector("form")!);
    const dest = push.mock.calls[0][0] as string;
    expect(dest).toContain("category=electrician");
    expect(dest).toContain("district=Colombo");
    expect(dest).toContain("ratingMin=4");
  });

  it("adds the availableOnly flag when the checkbox is ticked", () => {
    renderBar();
    fireEvent.click(screen.getByLabelText(t.browse.availableOnly));
    expect(push.mock.calls[0][0]).toContain("availableOnly=1");
  });

  it("passes a non-default sort through as a query param on blur", () => {
    renderBar();
    const sort = screen.getByLabelText(t.browse.sortLabel);
    fireEvent.change(sort, { target: { value: "rating" } });
    // Browsing options (change) must not navigate; blur commits the choice.
    expect(push).not.toHaveBeenCalled();

    fireEvent.blur(sort, { target: { value: "rating" } });
    expect(push.mock.calls[0][0]).toContain("sort=rating");
  });

  it("keeps the recommended sort out of the URL", () => {
    // Start from a non-default sort so blur has a real change to commit, then
    // switch back to recommended — it must navigate but drop the sort param.
    renderBar({ category: "plumber", sort: "rating" });
    const sort = screen.getByLabelText(t.browse.sortLabel);
    fireEvent.change(sort, { target: { value: "recommended" } });
    fireEvent.blur(sort, { target: { value: "recommended" } });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).not.toContain("sort=");
  });

  it("does not navigate on blur when the sort is unchanged (#658)", () => {
    renderBar({ category: "plumber", sort: "rating" });
    const sort = screen.getByLabelText(t.browse.sortLabel);
    // Tabbing through the select without picking a new option fires blur but
    // must not navigate (it would silently reset pagination otherwise).
    fireEvent.blur(sort, { target: { value: "rating" } });
    expect(push).not.toHaveBeenCalled();
  });

  it("preserves the current page when only the sort changes (#658)", () => {
    renderBar({ category: "plumber", sort: "recommended", page: 3 });
    const sort = screen.getByLabelText(t.browse.sortLabel);
    fireEvent.change(sort, { target: { value: "rating" } });
    fireEvent.blur(sort, { target: { value: "rating" } });
    const dest = push.mock.calls[0][0] as string;
    expect(dest).toContain("sort=rating");
    expect(dest).toContain("page=3");
  });

  it("resets pagination when a filter (not sort) changes", () => {
    // A category/search change drops `page` even when one was set — a new
    // filter should land the user back on page 1.
    renderBar({ category: "plumber", page: 3 });
    fireEvent.click(screen.getByLabelText(t.browse.availableOnly));
    const dest = push.mock.calls.at(-1)![0] as string;
    expect(dest).not.toContain("page=");
  });
});
