import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { App } from "./App";
import { adaptGold } from "./gold/adapter";
import { assertGoldContract } from "./gold/assert";
import { selectWindow } from "./gold/select";
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

describe("observatory shell", () => {
  it("renders independent source cards and does not sum them into visitors", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Executive overview" })).toBeInTheDocument();
    expect(screen.getByText(/Fixture dataset/i)).toBeInTheDocument();
    expect(screen.getAllByText("Cloudflare").length).toBeGreaterThan(0);
    expect(screen.getAllByText("GA4").length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: /^visitors$/i })).not.toBeInTheDocument();

    const payload = selectWindow(fixture, fixture.defaultWindowId);
    const edge = payload.overview.metrics.find((m) => m.id === "edge.requests")?.value;
    const rum = payload.overview.metrics.find((m) => m.id === "rum.pageviews")?.value;
    const ga4 = payload.overview.metrics.find((m) => m.id === "ga4.sessions")?.value;
    const illegal = (edge ?? 0) + (rum ?? 0) + (ga4 ?? 0);
    expect(screen.queryByText(illegal.toLocaleString("en-US"))).not.toBeInTheDocument();
    expect(screen.getByText(edge!.toLocaleString("en-US"))).toBeInTheDocument();
  });

  it("opens the evidence drawer with definition, source, grain and pipeline version", async () => {
    const user = userEvent.setup();
    render(<App />);
    const card = await screen.findByRole("button", { name: /Edge requests/i });
    await user.click(card);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Definition")).toBeInTheDocument();
    expect(within(dialog).getByText("Pipeline version")).toBeInTheDocument();
    expect(within(dialog).getByText("Definition")).toBeInTheDocument();
    expect(within(dialog).getByText("This is volume, not visitors.")).toBeInTheDocument();
  });

  it("navigates to the laboratory and keeps URL state shareable", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Executive overview" });
    await user.click(screen.getByRole("button", { name: "Laboratory" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Measurement laboratory" })).toBeInTheDocument();
    expect(window.location.search).toContain("view=laboratory");
    expect(screen.getByText(/Source disagreement/i)).toBeInTheDocument();
  });

  it("lists named AI actors", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Executive overview" });
    await user.click(screen.getByRole("button", { name: "AI & agents" }));
    expect((await screen.findAllByText("GPTBot")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("ClaudeBot").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ChatGPT-User").length).toBeGreaterThan(0);
  });
});
