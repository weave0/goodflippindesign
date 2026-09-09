import { fileURLToPath } from "node:url";
import { join } from "node:path";

const defaultOutputDir = fileURLToPath(new URL(".", import.meta.url));
export const screenshotOutputDir = process.env.TRAFFIC_INTELLIGENCE_SCREENSHOT_DIR ?? defaultOutputDir;

export default async function run(page) {
  const dir = screenshotOutputDir;
  const shots = [];
  async function shot(name) {
    await page.screenshot({ path: join(dir, name), fullPage: true });
    shots.push(name);
  }

  await page.setViewportSize({ width: 1440, height: 920 });
  await page.waitForSelector(".metric-card");
  await shot("01-overview-desktop.png");

  await page.getByRole("button", { name: /Edge requests, Cloudflare edge/i }).first().click();
  await page.waitForSelector('[role="dialog"]');
  await shot("02-evidence-drawer.png");
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: "Humans" }).click();
  await page.waitForSelector("text=Humans vs machines");
  await shot("03-humans.png");

  await page.getByRole("button", { name: "AI & agents" }).click();
  await page.waitForSelector("text=Named actors");
  await shot("04-ai-actors.png");

  await page.getByRole("button", { name: "Sites" }).click();
  await page.waitForSelector(".site-card");
  await shot("05-sites.png");

  await page.locator(".site-card").first().click();
  await page.waitForSelector("text=dossier");
  await shot("06-site-dossier.png");

  await page.getByRole("button", { name: "Laboratory" }).click();
  await page.waitForSelector("text=Source disagreement");
  await shot("07-laboratory.png");

  await page.getByRole("button", { name: "Technical health" }).click();
  await page.waitForSelector("text=Error paths");
  await shot("08-health.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Overview" }).click();
  await page.waitForSelector(".metric-card");
  await shot("09-overview-mobile.png");

  return { title: await page.title(), shots };
}
