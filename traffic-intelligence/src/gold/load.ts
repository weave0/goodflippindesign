import type { GoldContract } from "./types";
import { getAdminToken } from "../auth";
import { adaptGold } from "./adapter";
import { assertGoldContract } from "./assert";

export const GOLD_URL = `${import.meta.env.BASE_URL}gold/canonical-gold-m1.2.json`;

export async function loadGold(url: string = GOLD_URL): Promise<GoldContract> {
  const token = getAdminToken();
  if (!token) throw new Error("Gold contract unavailable: administrator authorization required");

  const response = await fetch(url, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Gold contract HTTP ${response.status} from ${url}`);
  }
  const data: unknown = await response.json();
  const adapted = adaptGold(data);
  assertGoldContract(adapted);
  return adapted;
}
