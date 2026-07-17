#!/usr/bin/env node
/**
 * Build script - Auto-generates manifest files
 * Run: node build/build.js
 */

import { writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildPostsManifest, buildThoughtTrainsManifest, buildLabsManifest, buildSoundsManifest, buildGalleryManifest, buildCoversManifest, buildFlightsManifest, buildEnergyManifest } from '../v1/js/build/manifest-builder.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const v1Dir = join(rootDir, 'v1');

const postsDir = join(v1Dir, 'posts');
const thoughtTrainDir = join(v1Dir, 'thought-train');
const labsDir = join(v1Dir, 'labs');
const soundsDir = join(v1Dir, 'sounds');
const galleryDir = join(v1Dir, 'gallery');
const coversDir = join(v1Dir, 'covers');
const flightsPath = join(rootDir, 'flights.md');
const energyPath = join(rootDir, 'energy.md');


async function build() {

  // Build posts manifest
  const posts = buildPostsManifest(postsDir);
  const postsContent = `/**
 * Posts Manifest (auto-generated)
 * Using object format with created dates from filesystem
 * Run 'node build/build.js' to regenerate after adding new posts
 */

export default ${JSON.stringify(posts, null, 2)};
`;
  writeFileSync(join(v1Dir, 'posts.js'), postsContent);
  console.log(`✓ Generated posts.js with ${posts.length} posts`);

  // Build thought trains manifest
  const thoughtTrains = buildThoughtTrainsManifest(thoughtTrainDir);
  const thoughtTrainContent = `/**
 * Thought Trains Manifest (auto-generated)
 * Using object format with created dates from filesystem
 * Run 'node build/build.js' to regenerate after adding new thought trains
 */

export default ${JSON.stringify(thoughtTrains, null, 2)};
`;
  writeFileSync(join(v1Dir, 'thought-trains.js'), thoughtTrainContent);
  console.log(`✓ Generated thought-trains.js with ${thoughtTrains.length} thought trains`);

  // Build labs manifest (if directory exists)
  if (existsSync(labsDir)) {
    const labs = buildLabsManifest(labsDir);
    const labsContent = `/**
 * Labs Manifest (auto-generated)
 * Run 'node build/build.js' to regenerate after adding new labs
 */

export default ${JSON.stringify(labs, null, 2)};
`;
    writeFileSync(join(v1Dir, 'labs.js'), labsContent);
    console.log(`✓ Generated labs.js with ${labs.length} labs`);
  }

  // Build sounds manifest (if directory exists)
  if (existsSync(soundsDir)) {
    const sounds = buildSoundsManifest(soundsDir);
    const soundsContent = `/**
 * Sounds Manifest (auto-generated)
 * Lists all audio files in the sounds/ directory
 * Run 'node build/build.js' to regenerate after adding new sounds
 */

export default ${JSON.stringify(sounds, null, 2)};
`;
    writeFileSync(join(v1Dir, 'sounds.js'), soundsContent);
    console.log(`✓ Generated sounds.js with ${sounds.length} sounds`);
  }

  // Build gallery manifest (if directory exists)
  if (existsSync(galleryDir)) {
    const gallery = buildGalleryManifest(galleryDir);
    const galleryContent = `/**
 * Gallery Manifest (auto-generated)
 * Lists all photo albums in the gallery/ directory
 * Run 'node build/build.js' to regenerate after adding new albums
 */

export default ${JSON.stringify(gallery, null, 2)};
`;
    writeFileSync(join(v1Dir, 'gallery.js'), galleryContent);
    console.log(`✓ Generated gallery.js with ${gallery.length} albums`);
  }

  // Build covers manifest (downloads missing covers from Open Library)
  const covers = await buildCoversManifest(postsDir, coversDir);
  const coversContent = `/**
 * Book Covers Manifest (auto-generated)
 * Maps book files to their cover images
 * Run 'node build/build.js' to regenerate and download missing covers
 */

export default ${JSON.stringify(covers, null, 2)};
`;
  writeFileSync(join(v1Dir, 'covers.js'), coversContent);
  console.log(`✓ Generated covers.js with ${covers.length} books`);

  // Build flights manifest
  const flights = buildFlightsManifest(flightsPath);
  const flightsContent = `/**
 * Flights Manifest (auto-generated)
 * Run 'node build/build.js' to regenerate after editing flights.md
 */

export default ${JSON.stringify(flights, null, 2)};
`;
  writeFileSync(join(rootDir, 'flights.js'), flightsContent);
  console.log(`✓ Generated flights.js with ${flights.length} flights`);

  // Build energy board manifest
  const energy = buildEnergyManifest(energyPath);
  const energyContent = `/**
 * Energy Board Manifest (auto-generated)
 * Run 'node build/build.js' to regenerate after editing energy.md
 */

export default ${JSON.stringify(energy, null, 2)};
`;
  writeFileSync(join(rootDir, 'energy.js'), energyContent);
  console.log(`✓ Generated energy.js with ${energy.length} cards`);
}

build().catch(console.error);
