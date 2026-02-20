/**
 * Converts JSON-encoded escape sequences (`\\n`, `\\t`, `\\r`, `\\\\`) in `s`
 * to their literal character equivalents.
 *
 * Claude streams tool inputs as JSON-encoded strings. This function is used to
 * make those strings human-readable before displaying them in the UI.
 *
 * @example
 * unescapeJsonString('line1\\nline2') // => 'line1\nline2'
 */
export function unescapeJsonString(s: string): string {
  return s.replace(/\\(n|t|r|\\)/g, (_, c: string) => {
    switch (c) {
      case 'n':
        return '\n'
      case 't':
        return '\t'
      case 'r':
        return '\r'
      default:
        return '\\'
    }
  })
}
