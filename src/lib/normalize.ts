/**
 * Text normalization for semantic matching. Replaces rigid exact matching so that
 * 0→1, 0-to-1, zero to one, and similar variants all match.
 */

/**
 * Semantic normalization for matching: → to " to ", hyphens to space, strip special
 * characters (+, $, parentheses, etc.), collapse whitespace, lowercase.
 * Apply to job title, description, and every keyword/surface list before comparison.
 */
export function normalizeForMatch(text: string | null | undefined): string {
  if (text == null) return "";
  let s = String(text)
    .replace(/\u2192/g, " to ")   // →
    .replace(/\u2013|\u2014/g, " ") // en/em dash
    .replace(/-/g, " ")          // hyphens to space so "0-to-1" matches "0 to 1"
    .replace(/[^\w\s]/g, " ")    // strip + $ ( ) and other special chars
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return s;
}

/** Normalized text as a bag of tokens (split on space). */
export function tokenizeNormalized(normalized: string): string[] {
  return normalized ? normalized.split(/\s+/).filter(Boolean) : [];
}

/**
 * Check if all tokens appear in normalized text within a reasonable distance.
 * "Reasonable" = within same ~word window (max gap between consecutive token positions).
 */
const MAX_TOKEN_GAP = 12;

export function tokensWithinDistance(normalizedText: string, phrase: string): boolean {
  const textTokens = tokenizeNormalized(normalizedText);
  const phraseTokens = tokenizeNormalized(normalizeForMatch(phrase));
  if (phraseTokens.length === 0) return false;
  let firstIdx = -1;
  let lastIdx = -1;
  for (const pt of phraseTokens) {
    const idx = textTokens.indexOf(pt);
    if (idx === -1) return false;
    if (firstIdx === -1) firstIdx = idx;
    lastIdx = idx;
  }
  return lastIdx - firstIdx <= MAX_TOKEN_GAP;
}

/** Synonym groups: any member matches any other for scoring. First form is canonical for "contains" checks. */
export const SYNONYM_GROUPS: { equivalents: string[] }[] = [
  { equivalents: ["genai", "generative ai", "gen ai", "llm", "large language model", "language model"] },
  { equivalents: ["0 to 1", "0 to one", "zero to one", "launch", "0-1", "greenfield", "from scratch"] },
  { equivalents: ["pm-t", "pmt", "technical product manager", "technical pm"] },
];

/** Expand a term into its normalized equivalents for "contains" checks. */
export function getEquivalents(term: string): string[] {
  const n = normalizeForMatch(term);
  for (const g of SYNONYM_GROUPS) {
    if (g.equivalents.some((e) => e.includes(n) || n.includes(e))) return g.equivalents;
  }
  return [n];
}

/** True if normalized text contains any of the normalized equivalents of term. */
export function normalizedContains(text: string | null | undefined, term: string): boolean {
  const norm = normalizeForMatch(text);
  const equivalents = getEquivalents(term);
  return equivalents.some((e) => norm.includes(e));
}

/** True if normalized text contains the phrase (exact normalized substring) or all tokens within distance. */
export function normalizedContainsOrTokensWithin(text: string | null | undefined, phrase: string): boolean {
  const norm = normalizeForMatch(text);
  if (norm.includes(normalizeForMatch(phrase))) return true;
  return tokensWithinDistance(norm, phrase);
}
