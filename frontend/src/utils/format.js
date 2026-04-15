/**
 * Format a TON value for display.
 * - Removes trailing zeros after decimal point
 * - Shows up to 4 decimal places
 * - Examples: 0.0001, 1.5, 100, 0.25
 */
export function formatTON(value) {
  const num = Number(value) || 0;
  // Use 4 decimal places, then strip trailing zeros
  const fixed = num.toFixed(4);
  // Remove trailing zeros but keep at least one digit after dot if there's a fractional part
  return fixed.replace(/\.?0+$/, '') || '0';
}
