/**
 * Shared Manifest Builder
 * Eliminates duplication between build.js and dev.js
 */

import { readdirSync, statSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

/**
 * Build posts manifest from markdown files
 * @param {string} postsDir - Path to posts directory
 * @returns {Array} Array of {file, created} objects
 */
export function buildPostsManifest(postsDir) {
  const files = readdirSync(postsDir)
    .filter(file => file.endsWith('.md'))
    .sort();

  return files.map(file => {
    const filePath = join(postsDir, file);
    const stats = statSync(filePath);
    const created = stats.birthtime.toISOString().split('T')[0];
    return { file, created };
  });
}

/**
 * Build thought trains manifest from markdown files
 * @param {string} trainDir - Path to thought-train directory
 * @returns {Array} Array of {file, created} objects
 */
export function buildThoughtTrainsManifest(trainDir) {
  const files = readdirSync(trainDir)
    .filter(file => file.endsWith('.md'))
    .sort();

  return files.map(file => {
    const filePath = join(trainDir, file);
    const stats = statSync(filePath);
    const created = stats.birthtime.toISOString().split('T')[0];
    return { file, created };
  });
}

/**
 * Build labs manifest from markdown files
 * @param {string} labsDir - Path to labs directory
 * @returns {Array} Array of {file, created} objects
 */
export function buildLabsManifest(labsDir) {
  const files = readdirSync(labsDir)
    .filter(file => file.endsWith('.md'))
    .sort();

  return files.map(file => {
    const filePath = join(labsDir, file);
    const stats = statSync(filePath);
    const created = stats.birthtime.toISOString().split('T')[0];
    return { file, created };
  });
}

/**
 * Build sounds manifest from audio files
 * @param {string} soundsDir - Path to sounds directory
 * @returns {Array} Array of {file, created} objects
 */
export function buildSoundsManifest(soundsDir) {
  // Common audio formats
  const audioExtensions = ['.m4a', '.mp3', '.wav', '.ogg', '.aac', '.flac', '.webm', '.qta'];

  const files = readdirSync(soundsDir)
    .filter(file => audioExtensions.some(ext => file.toLowerCase().endsWith(ext)))
    .sort();

  return files.map(file => {
    const filePath = join(soundsDir, file);
    const stats = statSync(filePath);
    const created = stats.birthtime.toISOString().split('T')[0];
    return { file, created };
  });
}

/**
 * Generate a thumbnail for an image using macOS sips
 * @param {string} srcPath - Source image path
 * @param {string} thumbPath - Destination thumbnail path
 * @param {number} maxWidth - Maximum thumbnail width (default 800)
 */
function generateThumbnail(srcPath, thumbPath, maxWidth = 800) {
  try {
    // Use sips to resize (macOS built-in, no dependencies)
    execSync(`sips -Z ${maxWidth} "${srcPath}" --out "${thumbPath}" 2>/dev/null`, {
      stdio: 'pipe'
    });
    return true;
  } catch (e) {
    console.warn(`  ⚠ Failed to generate thumbnail for ${srcPath}`);
    return false;
  }
}

/**
 * Build gallery manifest from album folders
 * @param {string} galleryDir - Path to gallery directory
 * @returns {Array} Array of {folder, images, thumbs, created} objects
 */
export function buildGalleryManifest(galleryDir) {
  // Common image formats
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'];

  // Get all subdirectories (each is an album), excluding thumbs folders
  const folders = readdirSync(galleryDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory() && dirent.name !== 'thumbs')
    .map(dirent => dirent.name)
    .sort();

  return folders.map(folder => {
    const folderPath = join(galleryDir, folder);
    const thumbsPath = join(folderPath, 'thumbs');

    // Create thumbs directory if it doesn't exist
    if (!existsSync(thumbsPath)) {
      mkdirSync(thumbsPath, { recursive: true });
    }

    // Get all image files in this album folder (not in thumbs subfolder)
    const imageFiles = readdirSync(folderPath)
      .filter(file => {
        const filePath = join(folderPath, file);
        const stats = statSync(filePath);
        return stats.isFile() && imageExtensions.some(ext => file.toLowerCase().endsWith(ext));
      });

    // Sort images: KEY prefix first, then alphabetically
    const sortedImages = imageFiles.sort((a, b) => {
      const aIsKey = a.toUpperCase().startsWith('KEY');
      const bIsKey = b.toUpperCase().startsWith('KEY');

      if (aIsKey && !bIsKey) return -1;
      if (!aIsKey && bIsKey) return 1;
      return a.localeCompare(b);
    });

    // Generate thumbnails for each image
    const images = [];
    const thumbs = [];

    sortedImages.forEach(file => {
      const srcPath = join(folderPath, file);
      const thumbFile = file;
      const thumbFilePath = join(thumbsPath, thumbFile);

      images.push(`gallery/${folder}/${file}`);
      thumbs.push(`gallery/${folder}/thumbs/${thumbFile}`);

      // Generate thumbnail if it doesn't exist or source is newer
      if (!existsSync(thumbFilePath)) {
        console.log(`  → Generating thumbnail: ${folder}/thumbs/${file}`);
        generateThumbnail(srcPath, thumbFilePath);
      } else {
        // Check if source is newer than thumbnail
        const srcStats = statSync(srcPath);
        const thumbStats = statSync(thumbFilePath);
        if (srcStats.mtime > thumbStats.mtime) {
          console.log(`  → Updating thumbnail: ${folder}/thumbs/${file}`);
          generateThumbnail(srcPath, thumbFilePath);
        }
      }
    });

    // Get oldest file creation date as album date
    let oldestDate = new Date();
    imageFiles.forEach(file => {
      const filePath = join(folderPath, file);
      const stats = statSync(filePath);
      if (stats.birthtime < oldestDate) {
        oldestDate = stats.birthtime;
      }
    });

    return {
      folder,
      images,
      thumbs,
      created: oldestDate.toISOString().split('T')[0]
    };
  });
}

// Known authors for popular books (fallback when not found in file)
const KNOWN_AUTHORS = {
  'Atomic Habits': 'James Clear',
  'Creativity, Inc.': 'Ed Catmull',
  'Steal Like An Artist': 'Austin Kleon',
  'The Ride of a Lifetime': 'Robert Iger',
  'The Speed of Trust': 'Stephen M.R. Covey',
  'Building A Second Brain': 'Tiago Forte',
  'Feel-Good Productivity': 'Ali Abdaal',
  'Show Your Work': 'Austin Kleon',
};

// Known ISBNs for books where title search returns wrong covers
const KNOWN_ISBNS = {
  'Atomic Habits': '9780735211292',
  'Building A Second Brain': '9781982167387',
};

/**
 * Parse book metadata from markdown content
 * Handles various formats:
 *   # B. Title       # B. Title
 *   Author           #tag
 *   Rating: N        By Author
 *                    Rating: N
 * @param {string} markdown - Raw markdown content
 * @param {string} filename - Book filename
 * @returns {Object} {title, author, rating}
 */
function parseBookMetadata(markdown, filename) {
  const lines = markdown.split('\n').map(line => line.trim());

  // Extract title from H1, removing "B. " prefix
  let title = '';
  const h1Match = lines[0]?.match(/^#\s+(.+)/);
  if (h1Match) {
    title = h1Match[1].replace(/^b\.\s*/i, '').trim();
  } else {
    title = filename.replace(/\.md$/i, '').replace(/^b\.\s*/i, '').trim();
  }

  // Find author - check various patterns
  let author = null;
  for (let i = 1; i < Math.min(lines.length, 15); i++) {
    const line = lines[i];
    if (!line) continue;

    // Skip markdown formatting and non-author content
    if (line.startsWith('#')) continue;  // Hashtags or headers
    if (line.startsWith('>')) continue;  // Blockquotes
    if (line.startsWith('*')) continue;  // Italics/bold/lists
    if (line.startsWith('-')) continue;  // Lists
    if (line.startsWith('!')) continue;  // Images ![](...)
    if (line.startsWith('[')) continue;  // Links
    if (line.match(/^\d+\./)) continue;  // Numbered lists
    if (line.match(/^rating:/i)) continue;  // Rating line
    if (line.match(/^url:/i)) continue;  // URL line
    if (line.match(/^created/i)) continue;  // Created time
    if (line.match(/^".*"$/)) continue;  // Quoted text
    if (line.match(/^---$/)) continue;  // Horizontal rule

    // Check for "Author: Name" format
    const authorMatch = line.match(/^author:\s*(.+)/i);
    if (authorMatch) {
      author = authorMatch[1].trim();
      break;
    }

    // Check for "By Author" format
    const byMatch = line.match(/^by\s+(.+)/i);
    if (byMatch) {
      author = byMatch[1].trim();
      break;
    }
  }

  // Fallback to known authors if not found
  if (!author) {
    author = KNOWN_AUTHORS[title] || 'Unknown Author';
  }

  // Find rating anywhere in first 15 lines
  let rating = 0;
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const ratingMatch = lines[i]?.match(/^rating:\s*(\d+)/i);
    if (ratingMatch) {
      rating = parseInt(ratingMatch[1], 10);
      break;
    }
  }

  return { title, author, rating };
}

/**
 * Generate a safe filename from book title
 * @param {string} title - Book title
 * @returns {string} Safe filename
 */
function titleToFilename(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Download a book cover from Google Books API (better English edition matching)
 * @param {string} title - Book title
 * @param {string} author - Book author
 * @param {string} destPath - Destination file path
 * @returns {Promise<boolean>} Success status
 */
async function downloadCover(title, author, destPath) {
  try {
    // If we have a known ISBN, search by that first for guaranteed correct edition
    const isbn = KNOWN_ISBNS[title];
    const query = isbn
      ? `isbn:${isbn}`
      : `intitle:${title}+inauthor:${author}`;
    const searchUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&langRestrict=en&maxResults=5&printType=books`;

    const response = await fetch(searchUrl);
    if (!response.ok) {
      console.warn(`    API error for "${title}": ${response.status}`);
      return false;
    }

    const data = await response.json();
    if (!data.items || data.items.length === 0) {
      console.warn(`    No results for "${title}"`);
      return false;
    }

    // Find the best match with a cover image
    let coverUrl = null;
    if (isbn) {
      // ISBN search - trust the result, just find one with a cover
      for (const item of data.items) {
        const imageLinks = item.volumeInfo?.imageLinks;
        if (imageLinks) {
          coverUrl = imageLinks.extraLarge || imageLinks.large || imageLinks.medium || imageLinks.thumbnail;
          if (coverUrl) break;
        }
      }
    } else {
      // Title/author search - filter out summaries/knockoffs/translations
      const skipTitleWords = ['summary', 'workbook', 'study guide', 'illustration', 'review', 'analysis', 'companion', 'notebook', 'trivia', 'quiz', 'for fans', 'key takeaways', 'cliff notes', 'sparknotes'];
      const skipPublishers = ['trivion', 'goldmine reads', 'readtrepreneur', 'instaread'];
      const authorLower = author.toLowerCase();
      for (const item of data.items) {
        const info = item.volumeInfo;
        if (!info) continue;
        // Must be English
        if (info.language && info.language !== 'en') continue;
        const itemTitle = (info.title || '').toLowerCase() + ' ' + (info.subtitle || '').toLowerCase();
        // Skip knockoff/summary editions
        if (skipTitleWords.some(w => itemTitle.includes(w))) continue;
        // Skip knockoff publishers
        const publisher = (info.publisher || '').toLowerCase();
        if (skipPublishers.some(p => publisher.includes(p))) continue;
        // Prefer results where author actually matches
        const authors = (info.authors || []).map(a => a.toLowerCase());
        const authorMatch = authors.some(a => a.includes(authorLower) || authorLower.includes(a));
        if (!authorMatch && authors.length > 0) continue;
        // Skip if no cover
        const imageLinks = info.imageLinks;
        if (!imageLinks) continue;
        coverUrl = imageLinks.extraLarge || imageLinks.large || imageLinks.medium || imageLinks.thumbnail;
        if (coverUrl) break;
      }
    }

    if (!coverUrl) {
      console.warn(`    No cover image for "${title}"`);
      return false;
    }

    // Google Books returns http URLs - upgrade to https and strip curl effect
    coverUrl = coverUrl.replace('http://', 'https://').replace('&edge=curl', '');
    // Request larger image via width parameter (keep default zoom for correct cover)
    coverUrl += '&w=600';

    // Download the image
    const imageResponse = await fetch(coverUrl);
    if (!imageResponse.ok) {
      console.warn(`    Failed to download cover for "${title}"`);
      return false;
    }

    const buffer = await imageResponse.arrayBuffer();
    writeFileSync(destPath, Buffer.from(buffer));
    return true;
  } catch (err) {
    console.warn(`    Error downloading cover for "${title}":`, err.message);
    return false;
  }
}

/**
 * Build covers manifest and download missing covers
 * @param {string} postsDir - Path to posts directory
 * @param {string} coversDir - Path to covers directory
 * @param {boolean} downloadCovers - Whether to download missing covers (default: true)
 * @returns {Promise<Array>} Array of {file, cover, title, author, rating} objects
 */
export async function buildCoversManifest(postsDir, coversDir, downloadCovers = true) {
  // Create covers directory if it doesn't exist
  if (!existsSync(coversDir)) {
    mkdirSync(coversDir, { recursive: true });
  }

  // Find all book files (b. prefix)
  const bookFiles = readdirSync(postsDir)
    .filter(file => file.toLowerCase().startsWith('b.') && file.endsWith('.md'))
    .sort();

  const manifest = [];

  for (const file of bookFiles) {
    const filePath = join(postsDir, file);
    const markdown = readFileSync(filePath, 'utf-8');
    const { title, author, rating } = parseBookMetadata(markdown, file);

    const coverFilename = titleToFilename(title) + '.jpg';
    const coverPath = join(coversDir, coverFilename);
    const coverExists = existsSync(coverPath);

    // Download cover if missing (uses Open Library - no API key needed)
    if (!coverExists && downloadCovers) {
      console.log(`  → Downloading cover: ${title}`);
      await downloadCover(title, author, coverPath);
    }

    manifest.push({
      file,
      cover: existsSync(coverPath) ? `covers/${coverFilename}` : null,
      title,
      author,
      rating
    });
  }

  return manifest;
}

/**
 * Build flights manifest from flights.md
 * @param {string} flightsPath - Path to flights.md file
 * @returns {Array} Array of flight objects {status, title, gate, url, description}
 */
export function buildFlightsManifest(flightsPath) {
  if (!existsSync(flightsPath)) {
    console.warn('flights.md not found, skipping flights manifest');
    return [];
  }

  const content = readFileSync(flightsPath, 'utf-8');
  const flights = [];
  let currentStatus = null;

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Match status headers: ## IN FLIGHT, ## ARRIVED, ## CANCELLED
    const statusMatch = trimmed.match(/^##\s+(IN FLIGHT|ARRIVED|CANCELLED)/i);
    if (statusMatch) {
      currentStatus = statusMatch[1].toUpperCase();
      continue;
    }

    // Skip empty lines or non-list items
    if (!trimmed || !trimmed.startsWith('-')) continue;
    if (!currentStatus) continue;

    // Parse flight entry: - [Title](url) | Gate | Date | Description
    // or: - Title | Gate | Date | Description (Date optional; 4th part is description)
    const listItem = trimmed.substring(1).trim();

    const parseRest = (gate, ...rest) => {
      if (rest.length >= 2) {
        return { gate, date: rest[0], description: rest.slice(1).join(' | ') };
      }
      if (rest.length === 1) {
        const d = rest[0];
        const isDate = /^\d{4}-\d{2}-\d{2}$|^[A-Za-z]{3}\s+\d{4}$/.test(d);
        return { gate, date: isDate ? d : '', description: isDate ? '' : d };
      }
      return { gate, date: '', description: '' };
    };

    // Try to match markdown link format: [Title](url) | Gate | Date? | Description
    const linkMatch = listItem.match(/^\[([^\]]+)\]\(([^)]+)\)\s*\|\s*(.+)$/);
    if (linkMatch) {
      const rest = linkMatch[3].split(/\s*\|\s*/).map(p => p.trim());
      const { gate, date, description } = parseRest(rest[0], ...rest.slice(1));
      flights.push({ status: currentStatus, title: linkMatch[1].trim(), url: linkMatch[2].trim(), gate, date, description });
      continue;
    }

    // Plain text format: Title | Gate | Date? | Description
    const parts = listItem.split(/\s*\|\s*/).map(p => p.trim());
    if (parts.length >= 2) {
      const { gate, date, description } = parseRest(parts[1], ...parts.slice(2));
      flights.push({ status: currentStatus, title: parts[0].trim(), url: null, gate, date, description });
    }
  }

  return flights;
}

/**
 * Build energy board manifest from energy.md
 * Parses "## Column Heading" sections into a flat list of goal cards for the
 * homepage "energy investment portfolio" Kanban board.
 * Line format: - icon | Title | Description   (icon + description optional)
 * Icon is a Lucide icon name (e.g. brain, camera) rendered as SVG on the board.
 * A trailing "(x/y)" in the title is pulled out as a progress fraction.
 * @param {string} energyPath - Path to energy.md
 * @returns {Array} Array of {column, icon, title, description, progress} objects
 */
export function buildEnergyManifest(energyPath) {
  if (!existsSync(energyPath)) {
    console.warn('energy.md not found, skipping energy manifest');
    return [];
  }

  const COLUMN_MAP = {
    'BUCKET LIST': 'bucket',
    'ACTIVE': 'active',
    'PASSIVE': 'passive',
    'COMPLETED': 'done'
  };

  const content = readFileSync(energyPath, 'utf-8');
  const cards = [];
  let currentColumn = null;

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    const headingMatch = trimmed.match(/^##\s+(.+)$/);
    if (headingMatch) {
      currentColumn = COLUMN_MAP[headingMatch[1].trim().toUpperCase()] || null;
      continue;
    }

    if (!trimmed.startsWith('-') || !currentColumn) continue;

    const listItem = trimmed.substring(1).trim();
    if (!listItem) continue;

    const parts = listItem.split(/\s*\|\s*/).map(p => p.trim());
    let icon = '';
    let title = '';
    let description = '';

    if (parts.length >= 2) {
      icon = parts[0];
      title = parts[1];
      description = parts.slice(2).join(' | ');
    } else {
      title = parts[0];
    }
    if (!title) continue;

    let progress = null;
    const progressMatch = title.match(/\(\s*(\d+)\s*\/\s*(\d+)\s*\)\s*$/);
    if (progressMatch) {
      progress = { current: parseInt(progressMatch[1], 10), total: parseInt(progressMatch[2], 10) };
      title = title.slice(0, progressMatch.index).trim();
    }

    cards.push({ column: currentColumn, icon, title, description, progress });
  }

  return cards;
}

