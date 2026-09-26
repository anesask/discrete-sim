/**
 * Escape one CSV cell: quote when it contains a comma, quote, CR or LF, and
 * neutralise leading characters that spreadsheets interpret as a formula
 * (=, +, -, @, tab, CR) by prefixing a single quote. Numbers are written as
 * they are.
 *
 * @internal
 */
export function csvCell(value: unknown): string {
  if (typeof value === 'number') return String(value);
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
