/**
 * Reading-time estimate for a markdown post — shared by api/content/list.js
 * and build/dev.js (its local dev proxy for the same endpoint) so the two
 * listings can't drift on this the way the photos sort once did.
 *
 * Frontmatter is expected to already be stripped by the caller (both call
 * sites read it anyway to pull the `date` field, so there's no reason to
 * duplicate that parse here).
 */

const WORDS_PER_MINUTE = 200;

export function estimateReadingMinutes(markdownBody) {
  const stripped = markdownBody
    .replace(/```[\s\S]*?```/g, ' ')          // fenced code blocks
    .replace(/`[^`]*`/g, ' ')                 // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')    // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')  // links — keep the label text
    .replace(/[#>*_~]/g, ' ');                // markdown punctuation
  const words = stripped.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
