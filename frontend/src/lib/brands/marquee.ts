// Marquee brand list — companies that trigger the full COP entrance show
// (scroll-unfurl + hero glyph flight + logo breath). All other companies
// fall back to "generic" tier (text-drop only; high-match adds dial + cover).
//
// Scope: North America engineering hiring (v0). No finance/consulting,
// no Chinese-domestic-only brands. Keep this list TIGHT — every entry
// dilutes the "wow" signal for the rest.

const MARQUEE_KEYS = [
  // FAANG+ core
  'apple',
  'google', 'alphabet',
  'meta', 'facebook',
  'amazon', 'aws',
  'netflix',
  'microsoft',

  // New giants
  'nvidia',
  'tesla',

  // AI labs
  'anthropic',
  'openai',
  'deepmind',
  'xai',

  // Engineering-flavored unicorns
  'bytedance', 'tiktok',
  'uber',
  'vercel',
  'notion',
  'figma',
  'stripe',

  // Aerospace
  'spacex',
] as const;

const MARQUEE_SET = new Set<string>(MARQUEE_KEYS);

export type BrandTier = 'generic' | 'marquee';

/**
 * Normalize a free-form company string for tier lookup.
 *   "Apple Inc."     → "apple"
 *   "Meta Platforms" → "meta platforms" (won't match — only exact base names hit)
 *   "  TikTok, "     → "tiktok"
 *
 * Strategy: lowercase, strip common corporate suffixes + punctuation,
 * collapse whitespace. We then do exact-set lookup; partial / fuzzy
 * matching is intentionally avoided to prevent "Applebee's" → marquee.
 */
function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co|plc|gmbh|sa|ag|holdings|platforms|technologies|technology|labs|ai|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getBrandTier(companyName: string | null | undefined): BrandTier {
  if (!companyName) return 'generic';
  const normalized = normalize(companyName);
  if (!normalized) return 'generic';
  if (MARQUEE_SET.has(normalized)) return 'marquee';
  // Try first-word match (handles "Google LLC" → "google" after suffix strip
  // already handled, but covers edge cases like "Anthropic PBC" before PBC
  // is in the strip list).
  const firstWord = normalized.split(' ')[0];
  if (MARQUEE_SET.has(firstWord)) return 'marquee';
  return 'generic';
}

/** True if the resume↔JD match score qualifies for "celebrate" treatment. */
export function isHighMatch(score: number | null | undefined): boolean {
  return typeof score === 'number' && score >= 80;
}
