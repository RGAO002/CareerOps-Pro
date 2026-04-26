// frontend/src/lib/relativeTime.test.ts
import { describe, expect, it } from "vitest";

import { formatRelative } from "./relativeTime";

describe("formatRelative", () => {
  const NOW = 1_000_000_000_000; // arbitrary fixed "now"

  it('returns "just now" for diffs under 5 seconds', () => {
    expect(formatRelative(NOW, NOW)).toBe("just now");
    expect(formatRelative(NOW - 4_999, NOW)).toBe("just now");
  });

  it('returns "X sec ago" for 5s..59s', () => {
    expect(formatRelative(NOW - 5_000, NOW)).toBe("5 sec ago");
    expect(formatRelative(NOW - 30_000, NOW)).toBe("30 sec ago");
    expect(formatRelative(NOW - 59_000, NOW)).toBe("59 sec ago");
  });

  it('returns "X min ago" for 1m..59m', () => {
    expect(formatRelative(NOW - 60_000, NOW)).toBe("1 min ago");
    expect(formatRelative(NOW - 60 * 60_000 + 1, NOW)).toBe("59 min ago");
  });

  it('returns "X hr ago" for 1h..23h', () => {
    expect(formatRelative(NOW - 60 * 60_000, NOW)).toBe("1 hr ago");
    expect(formatRelative(NOW - 23 * 60 * 60_000, NOW)).toBe("23 hr ago");
  });

  it('returns "yesterday" for exactly 1 day', () => {
    expect(formatRelative(NOW - 24 * 60 * 60_000, NOW)).toBe("yesterday");
  });

  it('returns "X days ago" for 2..6 days', () => {
    expect(formatRelative(NOW - 2 * 24 * 60 * 60_000, NOW)).toBe("2 days ago");
    expect(formatRelative(NOW - 6 * 24 * 60 * 60_000, NOW)).toBe("6 days ago");
  });

  it("returns absolute date for ≥7 days", () => {
    const result = formatRelative(NOW - 30 * 24 * 60 * 60_000, NOW);
    // Format depends on locale; just confirm it's NOT one of the relative phrases
    expect(result).not.toMatch(/ago|yesterday|just now/);
    expect(result.length).toBeGreaterThan(0);
  });

  it("uses real Date.now() if `now` arg is omitted", () => {
    // Should not throw and should return something sensible
    const result = formatRelative(Date.now() - 60_000);
    expect(result).toBe("1 min ago");
  });
});
