import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { App } from "./App";
import { adaptGold } from "./gold/adapter";
import { assertGoldContract } from "./gold/assert";
import type { GoldContract } from "./gold/types";

const fixture: GoldContract = adaptGold(
  JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../public/gold/fixture.v1.json"), "utf8")) as unknown,
);
assertGoldContract(fixture);

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => fixture,
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("human-first traffic intelligence shell", () => {
  it("opens with operator language, five primary destinations and an explicit fixture warning", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Traffic overview" })).toBeInTheDocument();
    expect(screen.getByText("Live traffic is not connected.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Audience" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sites & content" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI & automation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Data quality" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Technical health" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Laboratory" })).not.toBeInTheDocument();
  });

  it("puts findings before supporting measurements", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Traffic overview" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What matters now" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Key measurements" })).toBeInTheDocument();
    expect(screen.getByText(/things deserve attention|No material findings/i)).toBeInTheDocument();
    expect(screen.queryByText("Independent source cards")).not.toBeInTheDocument();
  });

  it("keeps only period and property as default global filters", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Traffic overview" });
    expect(screen.getByLabelText("Period")).toBeInTheDocument();
    expect(screen.getByLabelText("Property")).toBeInTheDocument();
    expect(screen.queryByLabelText("Taxonomy")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Confidence")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Content type")).not.toBeInTheDocument();
  });

  it("opens evidence without making methodology primary navigation", async () => {
    const user = userEvent.setup();
    render(<App />);
    const card = await screen.findByRole("button", { name: /Edge requests/i });
    await user.click(card);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Definition")).toBeInTheDocument();
    expect(within(dialog).getByText("Pipeline version")).toBeInTheDocument();
    expect(within(dialog).getByText("This is volume, not visitors.")).toBeInTheDocument();
  });

  it("keeps the canonical definition authoritative and glossary supplemental", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /Edge requests/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("This is volume, not visitors.")).toBeInTheDocument();
    expect(within(dialog).getByText("Supplemental glossary")).toBeInTheDocument();
  });

  it("safely omits supplemental glossary content when no matching definition exists", async () => {
    const user = userEvent.setup();
    const noGlossary = { ...fixture, definitions: [] };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => noGlossary })));
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /Edge requests/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("def.edge_request")).toBeInTheDocument();
    expect(within(dialog).queryByText("Supplemental glossary")).not.toBeInTheDocument();
    cleanup();
  });

  it("moves source disagreement and technical evidence into Data quality", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Traffic overview" });
    await user.click(screen.getByRole("button", { name: "Data quality" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Data quality" })).toBeInTheDocument();
    expect(window.location.search).toContain("view=laboratory");
    expect(screen.getByRole("heading", { name: "Source disagreement" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "HTTP method" })).toBeInTheDocument();
    expect(screen.getByLabelText("Source")).toBeInTheDocument();
    expect(screen.getByLabelText("Evidence")).toBeInTheDocument();
  });

  it("clears filters that become hidden when switching primary destinations", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/?view=laboratory&class=ai_crawler&quality=measured&coverage=partial_coverage");
    render(<App />);
    expect(await screen.findByRole("heading", { level: 1, name: "Data quality" })).toBeInTheDocument();
    expect(window.location.search).toContain("quality=measured");
    await user.click(screen.getByRole("button", { name: "Overview" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Traffic overview" })).toBeInTheDocument();
    expect(window.location.search).not.toContain("class=");
    expect(window.location.search).not.toContain("quality=");
    expect(window.location.search).not.toContain("coverage=");
  });

  it("groups named AI actors with other automation", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Traffic overview" });
    await user.click(screen.getByRole("button", { name: "AI & automation" }));
    expect((await screen.findAllByText("GPTBot")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("ClaudeBot").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ChatGPT-User").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Traffic class")).toBeInTheDocument();
  });
});
