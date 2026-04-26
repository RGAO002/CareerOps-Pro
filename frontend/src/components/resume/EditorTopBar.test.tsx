// frontend/src/components/resume/EditorTopBar.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Resume } from "@/lib/resumeApi";

// Mock next/navigation: ResumeDropdown calls useRouter, which requires the
// App Router context that doesn't exist in unit tests. Stub to a no-op.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

import { EditorTopBar } from "./EditorTopBar";

const fakeResume: Resume = {
  id: "abc123",
  user_id: "current-user",
  parent_id: null,
  is_base: true,
  title: "Test resume",
  schema_version: 1,
  created_at: 1000,
  updated_at: 1000,
  target_company: null,
  target_company_domain: null,
  target_role: null,
  is_user_consented_for_benchmark: false,
  doc: { type: "doc", content: [] },
};

describe("EditorTopBar — Export PDF", () => {
  // vi.spyOn return type is awkward to express precisely; use a loose any.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let openSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let printSpy: any;

  beforeEach(() => {
    // Stub window.open and window.print so we can assert what was called
    openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    printSpy = vi.spyOn(window, "print").mockImplementation(() => undefined);
  });

  afterEach(() => {
    openSpy.mockRestore();
    printSpy.mockRestore();
  });

  it("Export PDF opens /resume/:id/print in a new tab (NOT inline window.print)", () => {
    // REGRESSION: previously the Export button called window.print() inline
    // which rendered through the AppShell layout and produced a 101-page
    // broken output. The fix: open a dedicated /print route that has no
    // AppShell, so layout doesn't squeeze the canvas.
    render(
      <EditorTopBar
        current={fakeResume}
        available={[]}
        saveStatus="saved"
        lastSavedAt={Date.now()}
        editor={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Export PDF/i }));

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith(
      "/resume/abc123/print",
      "_blank",
      expect.stringContaining("noopener"),
    );
    // Crucially: the button must NOT call window.print() inline anymore
    expect(printSpy).not.toHaveBeenCalled();
  });
});
