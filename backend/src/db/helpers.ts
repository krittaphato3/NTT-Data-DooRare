/**
 * Parses PostgreSQL array string representation (e.g. "{ROLE1,ROLE2}" or "{}")
 * into a clean JavaScript array of strings.
 */
export function parsePgArray(arr: any): string[] {
  if (Array.isArray(arr)) return arr.map(String);
  if (typeof arr === 'string') {
    const cleaned = arr.replace(/^{|}$/g, '').trim();
    if (!cleaned) return [];
    return cleaned
      .split(',')
      .map((s) => s.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
  }
  return [];
}
