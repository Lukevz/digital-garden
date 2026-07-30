/**
 * Gemini key lookup for build-time scripts (index-vault.js, check-gaps.js).
 *
 * Order: GEMINI_API_KEY env var, then gemini-config.js at repo root (gitignored,
 * same pattern as music-config.js) exporting { apiKey }.
 * Tip: `set -a && source .env.local && set +a` before running locally.
 *
 * Lives in its own module so both build scripts can share it without importing
 * each other — index-vault.js imports check-gaps.js at the end of a run, and a
 * cycle back the other way would be needless rope.
 */
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

export async function loadApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const configPath = join(rootDir, 'gemini-config.js');
  if (existsSync(configPath)) {
    try {
      const mod = await import(pathToFileURL(configPath).href);
      const config = mod.default || mod;
      return config.apiKey || config.GEMINI_API_KEY || null;
    } catch (e) {
      console.warn(`  ⚠ could not read gemini-config.js: ${e.message}`);
    }
  }
  return null;
}
