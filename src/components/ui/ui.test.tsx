// @vitest-environment jsdom
import { useRef, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FaMagnifyingGlass } from "@/components/icons";
import PageHeader from "./PageHeader";
import StatReadout from "./StatReadout";
import EmptyState from "./EmptyState";
import { Field } from "./Field";
import Dialog from "./Dialog";
import Pagination from "./Pagination";
import { Skeleton, SkeletonList } from "./Skeleton";

afterEach(cleanup);

describe("PageHeader", () => {
  it("renders the tag, eyebrow, title and pulse-dot status line", () => {
    const { container } = render(
      <PageHeader tag="REG" eyebrow="Find help" title="Providers" status="12 found" />
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Providers");
    expect(screen.getByText("REG")).toBeTruthy();
    expect(screen.getByText("Find help")).toBeTruthy();
    expect(container.querySelector(".pulse-dot")).not.toBeNull();
  });
});

describe("StatReadout", () => {
  it("zero-pads numeric values and leaves strings untouched", () => {
    render(
      <StatReadout stats={[{ label: "TOTAL", value: 7 }, { label: "SORT", value: "A-Z" }]} />
    );
    expect(screen.getByText("07")).toBeTruthy();
    expect(screen.getByText("A-Z")).toBeTruthy();
    expect(screen.getByText("TOTAL")).toBeTruthy();
  });
});

describe("EmptyState", () => {
  it("renders icon, title and body", () => {
    const { container } = render(
      <EmptyState icon={FaMagnifyingGlass} title="No results" body="Try another search" />
    );
    expect(screen.getByRole("heading", { name: "No results" })).toBeTruthy();
    expect(screen.getByText("Try another search")).toBeTruthy();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

// Minimal host mirroring real call sites: a trigger that mounts the Dialog
// while open and points initial focus at a field inside it.
function DialogHost() {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <Dialog
          onClose={() => setOpen(false)}
          label="Test dialog"
          panelClassName="card"
          initialFocus={inputRef}
        >
          <input ref={inputRef} aria-label="Name" />
          <button type="button" onClick={() => setOpen(false)}>
            Close
          </button>
        </Dialog>
      )}
    </>
  );
}

describe("Dialog", () => {
  it("wires the modal a11y attributes, scroll lock and focus on open", () => {
    render(<DialogHost />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog", { name: "Test dialog" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(screen.getByLabelText("Name"));
  });

  it("closes on Escape, unlocks scrolling and restores focus to the opener", () => {
    render(<DialogHost />);
    const trigger = screen.getByRole("button", { name: "Open" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on overlay click but not on clicks inside the panel", () => {
    const { container } = render(<DialogHost />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).not.toBeNull();
    fireEvent.click(container.ownerDocument.querySelector(".fixed.inset-0")!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("puts the dialog role on the overlay in bare mode", () => {
    render(
      <Dialog onClose={() => {}} label="Lightbox">
        <p>content</p>
      </Dialog>
    );
    const dialog = screen.getByRole("dialog", { name: "Lightbox" });
    expect(dialog.className).toContain("fixed inset-0");
  });
});

describe("Pagination", () => {
  const hrefFor = (p: number) => `/providers?page=${p}`;

  it("renders nothing for a single page", () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} hrefFor={hrefFor} locale="en" />
    );
    expect(container.innerHTML).toBe("");
  });

  it("hides Previous on the first page and Next on the last", () => {
    render(
      <Pagination page={1} totalPages={3} hrefFor={hrefFor} locale="en" />
    );
    expect(screen.queryByRole("link", { name: "← Previous" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Next →" }).getAttribute("href")
    ).toBe("/providers?page=2");
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    cleanup();

    render(
      <Pagination page={3} totalPages={3} hrefFor={hrefFor} locale="en" />
    );
    expect(screen.queryByRole("link", { name: "Next →" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "← Previous" }).getAttribute("href")
    ).toBe("/providers?page=2");
  });

  it("is a labelled nav landmark, localized and overridable", () => {
    render(
      <Pagination page={2} totalPages={3} hrefFor={hrefFor} locale="si" />
    );
    expect(screen.getByRole("navigation", { name: "පිටු සංචාලනය" })).toBeTruthy();
    cleanup();

    render(
      <Pagination
        page={2}
        totalPages={3}
        hrefFor={hrefFor}
        locale="en"
        label="Open jobs"
      />
    );
    expect(screen.getByRole("navigation", { name: "Open jobs" })).toBeTruthy();
  });
});

describe("Skeleton", () => {
  it("maps tones to the shimmer fills and passes shape classes through", () => {
    const { container } = render(
      <>
        <Skeleton className="h-4 w-40 rounded" />
        <Skeleton tone="strong" className="h-8 rounded-lg" />
      </>
    );
    const [soft, strong] = Array.from(container.children);
    expect(soft.className).toContain("bg-ink-100");
    expect(soft.className).toContain("h-4 w-40 rounded");
    expect(strong.className).toContain("bg-ink-200");
  });

  it("SkeletonList renders the requested number of card rows", () => {
    const { container } = render(<SkeletonList rows={4} />);
    expect(container.querySelectorAll(".card").length).toBe(4);
  });
});

describe("Field", () => {
  it("associates the label and shows the error over the help text", () => {
    render(
      <Field label="Email" htmlFor="email" help="We never share it" error="Required">
        <input id="email" className="input" />
      </Field>
    );
    expect(screen.getByRole("alert").textContent).toBe("Required");
    expect(screen.queryByText("We never share it")).toBeNull();
    expect(screen.getByText("Email").getAttribute("for")).toBe("email");
  });

  it("links help text to the control via aria-describedby (#378)", () => {
    render(
      <Field label="Email" htmlFor="email" help="We never share it">
        <input id="email" className="input" />
      </Field>
    );
    const input = screen.getByLabelText("Email");
    expect(input.getAttribute("aria-describedby")).toBe("email-help");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(screen.getByText("We never share it").id).toBe("email-help");
  });

  it("marks the control invalid and links the error, merging existing aria-describedby (#378)", () => {
    render(
      <Field label="Email" htmlFor="email" help="We never share it" error="Required">
        <input id="email" className="input" aria-describedby="external-hint" />
      </Field>
    );
    const input = screen.getByLabelText("Email");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(
      "external-hint email-error"
    );
    expect(screen.getByRole("alert").id).toBe("email-error");
  });

  it("leaves the control untouched without an htmlFor", () => {
    render(
      <Field label="Email" error="Required">
        <input aria-label="Email" className="input" />
      </Field>
    );
    const input = screen.getByLabelText("Email");
    expect(input.getAttribute("aria-describedby")).toBeNull();
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });
});
