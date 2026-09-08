/**
 * Scientific aggregation helpers.
 * Null means not numerically known. Zero means measured zero.
 * Chart scale fallbacks belong in rendering, not here.
 */
export function sumOrNull(values: Array<number | null | undefined>): number | null {
  if (!values.length) return null;
  let total = 0;
  for (const value of values) {
    if (value === null || value === undefined) return null;
    if (!Number.isFinite(value)) return null;
    total += value;
  }
  return total;
}
