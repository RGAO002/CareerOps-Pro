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
    // We assert these were NOT called: the new Export PDF is an <a download>
    // that hits a backend endpoint and triggers a native browser download.
    // No window.open, no window.print.
    openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    printSpy = vi.spyOn(window, "print").mockImplementation(() => undefined);
  });

  afterEach(() => {
    openSpy.mockRestore();
    printSpy.mockRestore();
  });

  it("Export PDF is a direct download link to /api/resume/:id/pdf", () => {
    // REGRESSION over two earlier broken approaches:
    //   1. Inline window.print() in the editor — squeezed by AppShell layout,
    //      produced a 101-page broken output (each letter on its own line).
    //   2. New-tab /print route — page rendered blank in some Next.js
    //      versions AND was bad UX (user wanted Streamlit-style one-click).
    // Current: <a href="/api/resume/:id/pdf" download> — backend WeasyPrint
    // streams the PDF, browser downloads directly. Zero JS, zero preview.
    render(
      <EditorTopBar
        current={fakeResume}
        available={[]}
        saveStatus="saved"
        lastSavedAt={Date.now()}
        editor={null}
      />,
    );

    const link = screen.getByTitle(/Download the resume as PDF/i);
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("download");
    expect(link.getAttribute("href")).toMatch(/\/api\/resume\/abc123\/pdf$/);

    // Must NOT use window.open or window.print
    fireEvent.click(link);
    expect(openSpy).not.toHaveBeenCalled();
    expect(printSpy).not.toHaveBeenCalled();
  });
});
