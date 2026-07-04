import { describe, it, expect } from "vitest";
import { averageResponseMs } from "./response-time";

const at = (iso: string) => new Date(iso);

describe("averageResponseMs", () => {
  it("returns null when there are no inquiries", () => {
    expect(averageResponseMs([])).toBeNull();
  });

  it("returns null when nothing has been responded to", () => {
    expect(
      averageResponseMs([
        { createdAt: at("2026-01-01T00:00:00Z"), respondedAt: null },
      ])
    ).toBeNull();
  });

  it("averages only responded inquiries", () => {
    const rows = [
      // 1 hour
      {
        createdAt: at("2026-01-01T00:00:00Z"),
        respondedAt: at("2026-01-01T01:00:00Z"),
      },
      // 3 hours
      {
        createdAt: at("2026-01-02T00:00:00Z"),
        respondedAt: at("2026-01-02T03:00:00Z"),
      },
      // unanswered — excluded
      { createdAt: at("2026-01-03T00:00:00Z"), respondedAt: null },
    ];
    expect(averageResponseMs(rows)).toBe(2 * 60 * 60 * 1000);
  });

  it("ignores negative gaps from bad data", () => {
    const rows = [
      {
        createdAt: at("2026-01-01T02:00:00Z"),
        respondedAt: at("2026-01-01T01:00:00Z"),
      },
      {
        createdAt: at("2026-01-01T00:00:00Z"),
        respondedAt: at("2026-01-01T00:30:00Z"),
      },
    ];
    expect(averageResponseMs(rows)).toBe(30 * 60 * 1000);
  });

  it("rounds to whole milliseconds", () => {
    const rows = [
      {
        createdAt: at("2026-01-01T00:00:00.000Z"),
        respondedAt: at("2026-01-01T00:00:00.001Z"),
      },
      {
        createdAt: at("2026-01-01T00:00:00.000Z"),
        respondedAt: at("2026-01-01T00:00:00.002Z"),
      },
    ];
    expect(averageResponseMs(rows)).toBe(2);
  });
});
