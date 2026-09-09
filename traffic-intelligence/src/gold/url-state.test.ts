import { FILTER_DEFAULTS, parseFilters, serializeFilters } from "./url-state";

describe("shareable URL state", () => {
  it("round-trips non-default filters", () => {
    const filters = {
      ...FILTER_DEFAULTS,
      view: "laboratory" as const,
      window: "7d",
      site: "gfd",
      actor: "GPTBot",
      path: "/atlas",
    };
    const qs = serializeFilters(filters);
    expect(qs).toContain("view=laboratory");
    expect(parseFilters(qs)).toMatchObject({
      view: "laboratory",
      window: "7d",
      site: "gfd",
      actor: "GPTBot",
      path: "/atlas",
    });
  });

  it("falls back to overview for unknown views", () => {
    expect(parseFilters("?view=nope").view).toBe("overview");
  });
});
