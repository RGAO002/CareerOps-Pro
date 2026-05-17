import { useTransitionStore } from "../transition";

beforeEach(() => {
  useTransitionStore.setState({ phase: 0, resumeId: null });
});

describe("useTransitionStore", () => {
  it("starts at phase 0", () => {
    expect(useTransitionStore.getState().phase).toBe(0);
  });

  it("start() sets phase 1 and resumeId immediately", () => {
    useTransitionStore.getState().start("resume-123");
    expect(useTransitionStore.getState().phase).toBe(1);
    expect(useTransitionStore.getState().resumeId).toBe("resume-123");
  });

  it("finish() resets to phase 0", () => {
    useTransitionStore.getState().start("resume-123");
    useTransitionStore.getState().finish();
    expect(useTransitionStore.getState().phase).toBe(0);
    expect(useTransitionStore.getState().resumeId).toBeNull();
  });
});
