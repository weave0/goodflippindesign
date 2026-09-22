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

const insights = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../public/gold/traffic-insights-1.0.json"), "utf8"),
);

const workQueue = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../public/gold/ti-work-queue-1.0.json"), "utf8"),
);

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("ti-work-queue")
        ? workQueue
        : url.includes("traffic-insights")
          ? insights
          : fixture;
      return {
        ok: true,
        json: async () => body,
      };
    }),
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

  it("puts human traffic answers ahead of queue internals", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "What happened across the web estate" })).toBeInTheDocument();
    expect(screen.getByText("Measured edge requests")).toBeInTheDocument();
    expect(screen.getByText("Change vs prior period")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Top properties by traffic" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Biggest changes" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Where traffic came from" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Human vs machine evidence" })).toBeInTheDocument();

    const trafficOverview = screen.getByRole("heading", { name: "What happened across the web estate" });
    const queue = screen.getByRole("heading", { name: "Work funnel metrics" });
    expect(trafficOverview.compareDocumentPosition(queue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders the decision cockpit from estate_brief before queues of raw findings", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Traffic overview" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Executive estate brief" })).toBeInTheDocument();
    expect(screen.getAllByText(/Attention required/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Top briefs" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Comparative trends" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Property health matrix" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Action queue" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Needs attention" })).not.toBeInTheDocument();
    expect(screen.getByText(/Insight sidecar is fixture/i)).toBeInTheDocument();
  });

  it("defaults Top briefs to Act now + Investigate and can expand Watch", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Top briefs" });
    expect(screen.getByText(/Measurement gaps block some comparisons/i)).toBeInTheDocument();
    expect(screen.getByText(/Cache rate deteriorated on example.com/i)).toBeInTheDocument();
    expect(screen.queryByText(/HTTP requests increased on example.com/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Show Watch/i }));
    expect(screen.getByText(/HTTP requests increased on example.com/i)).toBeInTheDocument();
  });

  it("opens a property dossier from the health matrix using URL site state", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Property health matrix" });
    await user.click(screen.getAllByRole("button", { name: "example.com" })[0]!);
    expect(window.location.search).toContain("site=example.com");
    expect(await screen.findByRole("heading", { name: /Property dossier · example.com/i })).toBeInTheDocument();
  });

  it("fail-closes overview decision surfaces when insights are missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("traffic-insights")) {
          return { ok: false, status: 503, json: async () => ({}) };
        }
        return { ok: true, json: async () => fixture };
      }),
    );
    render(<App />);
    expect(await screen.findByRole("heading", { name: /Governed insights unavailable/i })).toBeInTheDocument();
    expect(screen.getByText(/Traffic insights HTTP 503/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Unavailable until the insight sidecar loads/i).length).toBeGreaterThan(0);
  });

  it("keeps truthful reporting range and property as the default global controls", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Traffic overview" });

    expect(screen.getByRole("region", { name: "Active reporting period" })).toBeInTheDocument();
    const rangeGroup = screen.getByRole("group", { name: "Reporting range" });
    expect(within(rangeGroup).getByRole("button", { name: "7 days" })).toBeEnabled();
    expect(within(rangeGroup).getByRole("button", { name: "28 days" })).toHaveAttribute("aria-pressed", "true");
    expect(within(rangeGroup).getByRole("button", { name: "90 days" })).toBeDisabled();
    expect(screen.getByText(/Range: 28 days/i)).toBeInTheDocument();
    expect(within(screen.getByRole("search", { name: "Traffic filters" })).getByLabelText("Property")).toBeInTheDocument();
    expect(screen.queryByLabelText("Taxonomy")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Confidence")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Content type")).not.toBeInTheDocument();
  });

  it("opens evidence from supporting measurements without making methodology primary navigation", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /Show key measurements/i }));
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
    await user.click(await screen.findByRole("button", { name: /Show key measurements/i }));
    await user.click(await screen.findByRole("button", { name: /Edge requests/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("This is volume, not visitors.")).toBeInTheDocument();
    expect(within(dialog).getByText("Supplemental glossary")).toBeInTheDocument();
  });

  it("safely omits supplemental glossary content when no matching definition exists", async () => {
    const user = userEvent.setup();
    const noGlossary = { ...fixture, definitions: [] };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.includes("traffic-insights") ? insights : noGlossary;
        return { ok: true, json: async () => body };
      }),
    );
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /Show key measurements/i }));
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
