import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { App } from "./App";
import { adaptGold } from "./gold/adapter";
import type { GoldContract } from "./gold/types";

const here = dirname(fileURLToPath(import.meta.url));
const gold: GoldContract = adaptGold(JSON.parse(readFileSync(join(here, "../public/gold/fixture.v1.json"), "utf8")) as unknown);
const baseInsights = JSON.parse(readFileSync(join(here, "../public/gold/traffic-insights-1.0.json"), "utf8"));
const workQueue = JSON.parse(readFileSync(join(here, "../public/gold/ti-work-queue-1.0.json"), "utf8"));

const PROP = "example.com";

const estateConfig = {
  schema_version: "1.1.0",
  governed_zone_count: 3,
  accounted_zone_count: 3,
  state_counts: { healthy: 1, governance_gap: 1, config_drift: 0, unobserved: 1 },
  zone_inventory: { authority: "analytics_credential", complete: true, count: 3 },
  pages_inventory: { authority: "deploy_credential", complete: true, count: 7 },
  credential_boundaries: [
    "The measurement (analytics) credential intentionally lacks Pages, Workers and RUM configuration authority; that is least privilege, not a data-quality defect.",
  ],
  properties: [
    {
      property_id: PROP,
      state: "healthy",
      reason: "Pages project exposes GitHub production authority and no conflicting serving DNS was observed.",
      authorities: { zone: "analytics_credential", dns: "analytics_credential", pages: "deploy_credential" },
      evidence_status: { zone: "observed", dns: "observed", pages: "observed" },
      unavailable_reasons: {},
    },
    {
      property_id: "direct.example",
      state: "governance_gap",
      reason: "Pages production is direct/ad-hoc; repository authority cannot be proven from Cloudflare project metadata.",
      authorities: { zone: "analytics_credential", dns: "analytics_credential", pages: "deploy_credential" },
      evidence_status: { zone: "observed", dns: "observed", pages: "observed" },
      unavailable_reasons: {},
    },
    {
      property_id: "dark.example",
      state: "unobserved",
      reason: "Pages configuration was not observed by the deploy_credential: HTTP 403.",
      authorities: { zone: "analytics_credential", dns: "analytics_credential", pages: "deploy_credential" },
      evidence_status: { zone: "observed", dns: "observed", pages: "unavailable" },
      unavailable_reasons: { pages: "HTTP 403" },
    },
  ],
};

function stubFetch(insights: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("ti-work-queue") ? workQueue : url.includes("traffic-insights") ? insights : gold;
      return { ok: true, json: async () => body };
    }),
  );
}

beforeEach(() => {
  window.history.replaceState({}, "", "/");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("estate deployment/config authority in the cockpit", () => {
  it("accounts for every governed zone and explains the credential boundary", async () => {
    stubFetch({ ...baseInsights, estate_config: estateConfig });
    render(<App />);
    const heading = await screen.findByRole("heading", { name: "Deployment & config authority" });
    const section = heading.closest("section")!;
    expect(within(section).getByTestId("estate-config-summary")).toHaveTextContent(
      "3 of 3 governed zones accounted for · Healthy 1 · Governance gap 1 · Config drift 0 · Unobserved 1 · Pages inventory 7 projects (complete)",
    );
    expect(within(section).getByText(/intentionally lacks Pages, Workers and RUM/)).toBeInTheDocument();
    expect(within(section).getByText("direct.example")).toBeInTheDocument();
    expect(within(section).getByText("dark.example")).toBeInTheDocument();
    expect(within(section).getAllByRole("row")).toHaveLength(4);
  });

  it("does not present healthy state as a defect", async () => {
    stubFetch({ ...baseInsights, estate_config: estateConfig });
    render(<App />);
    const heading = await screen.findByRole("heading", { name: "Deployment & config authority" });
    const healthyRow = within(heading.closest("section")!).getByText(PROP).closest("tr")!;
    expect(within(healthyRow).getByText("Healthy")).toBeInTheDocument();
    expect(within(healthyRow).queryByText(/gap|drift|unavailable/i)).toBeNull();
  });

  it("shows, in the dossier, which authority proved which fact", async () => {
    const user = userEvent.setup();
    stubFetch({ ...baseInsights, estate_config: estateConfig });
    render(<App />);
    await screen.findByRole("heading", { name: "Property health matrix" });
    await user.click(screen.getAllByRole("button", { name: PROP })[0]!);
    const panel = await screen.findByTestId("dossier-estate-config");
    expect(within(panel).getByText("Healthy")).toBeInTheDocument();
    expect(within(panel).getByText("Pages configuration: proven by the trusted deployment credential")).toBeInTheDocument();
    expect(within(panel).getByText("DNS records: proven by the measurement (analytics) credential")).toBeInTheDocument();
    expect(screen.getByText(/Healthy: no deployment\/config drift or governance gap\./)).toBeInTheDocument();
  });

  it("never renders absent estate evidence as healthy", async () => {
    const user = userEvent.setup();
    stubFetch({ ...baseInsights });
    render(<App />);
    const heading = await screen.findByRole("heading", { name: "Deployment & config authority" });
    expect(within(heading.closest("section")!).getByText(/unobserved, not healthy/)).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: PROP })[0]!);
    await screen.findByRole("heading", { name: /Property dossier/i });
    expect(screen.getAllByText(/unobserved, not healthy/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/No observed deployment\/config drift or governance gap/)).toBeNull();
    expect(screen.queryByText(/Healthy: no deployment\/config drift/)).toBeNull();
  });

  it("rejects a partially-accounted estate instead of rendering it as complete", async () => {
    stubFetch({ ...baseInsights, estate_config: { ...estateConfig, governed_zone_count: 4 } });
    render(<App />);
    expect(await screen.findByText(/accounts for 3 of 4 governed zones/)).toBeInTheDocument();
    expect(screen.queryByTestId("estate-config-summary")).toBeNull();
  });
});
