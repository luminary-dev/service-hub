// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FaMagnifyingGlass } from "@/components/icons";
import PageHeader from "./PageHeader";
import StatReadout from "./StatReadout";
import EmptyState from "./EmptyState";
import { Field } from "./Field";

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
