/**
 * Format a TON value for display.
 * - Removes trailing zeros after decimal point
 * - Shows up to 4 decimal places
 * - Examples: 0.0001, 1.5, 100, 0.25
 */
export function formatTON(value, decimals = 5) {
  const num = Number(value) || 0;
  return num.toFixed(decimals);
}
