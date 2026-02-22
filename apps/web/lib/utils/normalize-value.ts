/**
 * Normalize fully numeric strings for comparison.
 *
 * This handles format differences between API responses (e.g., "12" vs "12.0").
 * Uses Number() instead of parseFloat() to avoid converting mixed strings
 * like "12abc" to "12".
 *
 * @param v - The value to normalize
 * @returns The normalized string value
 *
 * @example
 * normalizeValue("12")    // "12"
 * normalizeValue("12.0")  // "12"
 * normalizeValue("12abc") // "12abc" (unchanged - not fully numeric)
 * normalizeValue("abc")   // "abc" (unchanged)
 */
export const normalizeValue = (v: unknown): string => {
  const raw = typeof v === "string" ? v : String(v);
  const trimmed = raw.trim();
  if (trimmed === "") return raw;
  const num = Number(trimmed);
  return Number.isFinite(num) ? String(num) : raw;
};
