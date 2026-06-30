/**
 * Travel log parser — YAML frontmatter + route array from trip markdown.
 */

/**
 * Parse YAML frontmatter from markdown content.
 * @param {string} content
 * @returns {{ frontmatter: Record<string, string | string[]>, body: string }}
 */
export function parseYAMLFrontmatter(content) {
  let frontmatter = {};
  let body = content;

  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return { frontmatter, body };

  const yaml = frontmatterMatch[1];
  const lines = yaml.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      i += 1;
      continue;
    }

    const key = line.substring(0, colonIndex).trim();
    const value = line.substring(colonIndex + 1).trim();

    if (!key) {
      i += 1;
      continue;
    }

    // Multi-line list: key:\n  - item\n  - item
    if (!value && i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) {
      const items = [];
      i += 1;
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        const item = lines[i].replace(/^\s*-\s+/, '').trim().replace(/^["']|["']$/g, '');
        if (item) items.push(item);
        i += 1;
      }
      frontmatter[key] = items;
      continue;
    }

    if (!value) {
      i += 1;
      continue;
    }

    if (value.startsWith('[') && value.endsWith(']')) {
      try {
        const arrayContent = value.slice(1, -1);
        frontmatter[key] = arrayContent
          .split(',')
          .map(item => item.trim().replace(/^["']|["']$/g, ''))
          .filter(item => item.length > 0);
      } catch {
        frontmatter[key] = [];
      }
    } else {
      frontmatter[key] = value.replace(/^["']|["']$/g, '');
    }

    i += 1;
  }

  body = content.replace(frontmatterMatch[0], '').trim();
  return { frontmatter, body };
}

/**
 * @param {string} content
 * @param {string} filename
 * @returns {object}
 */
export function parseTravel(content, filename) {
  const { frontmatter, body } = parseYAMLFrontmatter(content);
  const slug = filename.replace(/\.md$/i, '');

  return {
    slug,
    title: frontmatter.title || slug,
    city: frontmatter.city || frontmatter.title || slug,
    country: frontmatter.country || '',
    region: frontmatter.region || '',
    startDate: frontmatter.startDate || '',
    endDate: frontmatter.endDate || '',
    stampColor: frontmatter.stampColor || '#5c5c5c',
    miles: Number(frontmatter.miles) || 0,
    daysAbroad: Number(frontmatter.daysAbroad) || 0,
    galleryAlbum: frontmatter.galleryAlbum || '',
    highlight: frontmatter.highlight || '',
    route: Array.isArray(frontmatter.route) ? frontmatter.route : [],
    body: body.trim(),
    filename,
  };
}
