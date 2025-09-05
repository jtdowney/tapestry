#!/usr/bin/env node

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

import { generateChromeManifest, generateFirefoxManifest } from '../src/manifest-generator.js';

function buildManifest(browser: 'chrome' | 'firefox', outputDir: string) {
  const manifest = browser === 'chrome' ? generateChromeManifest() : generateFirefoxManifest();

  const manifestPath = join(outputDir, 'manifest.json');

  // Ensure output directory exists
  mkdirSync(dirname(manifestPath), { recursive: true });

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Generated ${browser} manifest: ${manifestPath}`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length !== 2) {
    console.error('Usage: build-manifest.ts <browser> <output-dir>');
    console.error('Example: build-manifest.ts chrome dist/chrome');
    process.exit(1);
  }

  const [browser, outputDir] = args;

  if (browser !== 'chrome' && browser !== 'firefox') {
    console.error('Browser must be either "chrome" or "firefox"');
    process.exit(1);
  }

  try {
    buildManifest(browser as 'chrome' | 'firefox', outputDir);
  } catch (error) {
    console.error('Failed to build manifest:', error);
    process.exit(1);
  }
}

main();
