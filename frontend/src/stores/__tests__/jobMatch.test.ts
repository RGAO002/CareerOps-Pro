import { useJobMatchStore } from "../jobMatch";

beforeEach(() => {
  useJobMatchStore.setState({ resumeId: null, loading: false, matches: [], signature: [], filter: "all", sort: "match" });
});

describe("useJobMatchStore", () => {
  it("fetch() loads 10 mock jobs", async () => {
    await useJobMatchStore.getState().fetch("resume-123");
    expect(useJobMatchStore.getState().matches).toHaveLength(10);
  });

  it("setFilter updates filter", () => {
    useJobMatchStore.getState().setFilter("spons");
    expect(useJobMatchStore.getState().filter).toBe("spons");
  });

  it("setSort updates sort", () => {
    useJobMatchStore.getState().setSort("salary");
    expect(useJobMatchStore.getState().sort).toBe("salary");
  });

  it("all mock jobs have required fields with valid tier", async () => {
    await useJobMatchStore.getState().fetch("resume-123");
    for (const job of useJobMatchStore.getState().matches) {
      expect(job).toHaveProperty("id");
      expect(job).toHaveProperty("matchScore");
      expect(["A", "B", "C"]).toContain(job.tier);
    }
  });
});
