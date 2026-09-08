import type { GoldContract } from "./types";
import { assertGoldContract } from "./assert";

export const GOLD_URL = `${import.meta.env.BASE_URL}gold/fixture.v1.json`;

export async function loadGold(url: string = GOLD_URL): Promise<GoldContract> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Gold contract HTTP ${response.status} from ${url}`);
  }
  const data: unknown = await response.json();
  assertGoldContract(data);
  return data;
}
