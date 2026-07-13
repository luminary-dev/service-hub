// @vitest-environment jsdom
//
// Location picker tests (#48). The Leaflet map module is stubbed (leaflet
// can't run under jsdom; LocationPickerMap.test.tsx covers the map wiring
// against a mocked leaflet) — these tests exercise the wrapper: the manual
// coordinate inputs as the keyboard path, the both-or-neither + Sri Lanka
// bounds validation, the clear action and the live status line.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { dict } from "@/lib/i18n";
import type { GeoPoint } from "@/lib/geo";

// The stub exposes a "pick" button so tests can simulate a map click without
// any of Leaflet's DOM requirements.
vi.mock("./LocationPickerMap", () => ({
  default: ({ onPick }: { onPick: (p: GeoPoint) => void }) => (
    <button
      type="button"
      data-testid="map-stub"
      onClick={() => onPick({ latitude: 6.9271, longitude: 79.8612 })}
    >
      map
    </button>
  ),
}));

import LocationPicker from "./LocationPicker";

const t = dict.en.location;

// The picker is controlled; the harness plays the owning form.
function Harness({ initial = null }: { initial?: GeoPoint | null }) {
  const [value, setValue] = useState<GeoPoint | null>(initial);
  return (
    <LocationPicker
      id="lp"
      value={value}
      onChange={setValue}
      district="Colombo"
    />
  );
}

afterEach(cleanup);

describe("LocationPicker (#48)", () => {
  it("starts unpinned with the optional label and no clear button", () => {
    render(<Harness />);
    expect(screen.getByText(t.label)).toBeTruthy();
    expect(screen.getByText(t.pinNotSet)).toBeTruthy();
    expect(screen.queryByRole("button", { name: t.clear })).toBeNull();
  });

  it("commits a complete in-bounds pair typed into the manual inputs", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(t.latitude), {
      target: { value: "7.2906" },
    });
    fireEvent.change(screen.getByLabelText(t.longitude), {
      target: { value: "80.6337" },
    });
    expect(screen.getByText(t.pinSet(7.2906, 80.6337))).toBeTruthy();
    expect(screen.getByRole("button", { name: t.clear })).toBeTruthy();
  });

  it("flags a half-typed pair and keeps the pin unset", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(t.latitude), {
      target: { value: "7.29" },
    });
    expect(screen.getByText(t.errPair)).toBeTruthy();
    expect(screen.getByText(t.pinNotSet)).toBeTruthy();
    expect(
      screen.getByLabelText(t.latitude).getAttribute("aria-invalid")
    ).toBe("true");
    expect(
      screen.getByLabelText(t.latitude).getAttribute("aria-describedby")
    ).toBe("lp-error");
  });

  it("rejects coordinates outside Sri Lanka", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(t.latitude), {
      target: { value: "51.5072" },
    });
    fireEvent.change(screen.getByLabelText(t.longitude), {
      target: { value: "-0.1276" },
    });
    expect(screen.getByText(t.errOutOfBounds)).toBeTruthy();
    expect(screen.getByText(t.pinNotSet)).toBeTruthy();
  });

  it("accepts a pick from the map and mirrors it into the inputs", async () => {
    render(<Harness />);
    fireEvent.click(await screen.findByTestId("map-stub"));
    expect(screen.getByText(t.pinSet(6.9271, 79.8612))).toBeTruthy();
    expect((screen.getByLabelText(t.latitude) as HTMLInputElement).value).toBe(
      "6.9271"
    );
    expect((screen.getByLabelText(t.longitude) as HTMLInputElement).value).toBe(
      "79.8612"
    );
  });

  it("clears the pin (and the inputs) via the clear button", () => {
    render(
      <Harness initial={{ latitude: 6.9271, longitude: 79.8612 }} />
    );
    fireEvent.click(screen.getByRole("button", { name: t.clear }));
    expect(screen.getByText(t.pinNotSet)).toBeTruthy();
    expect((screen.getByLabelText(t.latitude) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(t.longitude) as HTMLInputElement).value).toBe("");
  });

  it("treats emptying both inputs as clearing the pin", () => {
    render(
      <Harness initial={{ latitude: 6.9271, longitude: 79.8612 }} />
    );
    fireEvent.change(screen.getByLabelText(t.latitude), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText(t.longitude), { target: { value: "" } });
    expect(screen.getByText(t.pinNotSet)).toBeTruthy();
  });
});
