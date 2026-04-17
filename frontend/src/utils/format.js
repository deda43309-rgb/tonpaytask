/**
 * Format a TON value for display.
 * - Removes trailing zeros after decimal point
 * - Shows up to 4 decimal places
 * - Examples: 0.0001, 1.5, 100, 0.25
 */
export function formatTON(value, decimals = 4) {
  const num = Number(value) || 0;
  const fixed = num.toFixed(decimals);
  // Remove trailing zeros but keep at least one digit after dot if there's a fractional part
  return fixed.replace(/\.?0+$/, '') || '0';
}
