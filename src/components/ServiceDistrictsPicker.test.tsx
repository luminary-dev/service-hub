// @vitest-environment jsdom
//
// Multi-district service area picker (#502): the home district is pinned
// (always selected, not toggleable), extras toggle on and off, and the total
// is capped at MAX_SERVICE_DISTRICTS (home + extras).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dict } from "@/lib/i18n";
import { DISTRICTS, MAX_SERVICE_DISTRICTS } from "@/lib/constants";
import ServiceDistrictsPicker from "./ServiceDistrictsPicker";

const t = dict.en.serviceDistricts;

afterEach(cleanup);

function chip(name: string) {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

describe("ServiceDistrictsPicker", () => {
  it("renders every district with the home district pinned and pressed", () => {
    render(
      <ServiceDistrictsPicker
        id="sd"
        primary="Colombo"
        value={[]}
        onChange={() => {}}
      />
    );
    expect(screen.getAllByRole("button")).toHaveLength(DISTRICTS.length);
    const home = chip(`Colombo · ${t.homeBadge}`);
    expect(home.disabled).toBe(true);
    expect(home.getAttribute("aria-pressed")).toBe("true");
    expect(chip("Gampaha").getAttribute("aria-pressed")).toBe("false");
  });

  it("toggles an extra district on and off", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ServiceDistrictsPicker
        id="sd"
        primary="Colombo"
        value={[]}
        onChange={onChange}
      />
    );
    fireEvent.click(chip("Gampaha"));
    expect(onChange).toHaveBeenLastCalledWith(["Gampaha"]);

    rerender(
      <ServiceDistrictsPicker
        id="sd"
        primary="Colombo"
        value={["Gampaha"]}
        onChange={onChange}
      />
    );
    expect(chip("Gampaha").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(chip("Gampaha"));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("caps the selection at MAX_SERVICE_DISTRICTS including the home district", () => {
    const onChange = vi.fn();
    // 4 extras + home = the cap of 5; everything unselected must be disabled.
    render(
      <ServiceDistrictsPicker
        id="sd"
        primary="Colombo"
        value={["Gampaha", "Kalutara", "Kandy", "Galle"]}
        onChange={onChange}
      />
    );
    expect(1 + 4).toBe(MAX_SERVICE_DISTRICTS);
    const matara = chip("Matara");
    expect(matara.disabled).toBe(true);
    fireEvent.click(matara);
    expect(onChange).not.toHaveBeenCalled();
    // Selected extras stay removable.
    expect(chip("Gampaha").disabled).toBe(false);
    expect(screen.getByText(t.limitReached)).toBeTruthy();
  });

  it("ignores the primary district inside value (no double-count)", () => {
    const onChange = vi.fn();
    render(
      <ServiceDistrictsPicker
        id="sd"
        primary="Colombo"
        value={["Colombo", "Gampaha"]}
        onChange={onChange}
      />
    );
    fireEvent.click(chip("Kalutara"));
    expect(onChange).toHaveBeenLastCalledWith(["Gampaha", "Kalutara"]);
  });
});
