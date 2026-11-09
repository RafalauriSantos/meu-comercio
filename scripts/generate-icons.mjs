// Generates the PNG icons of the installable app from the brand mark (src/app/icon.svg).
// Run by hand when the mark changes: node scripts/generate-icons.mjs
// It needs `sharp`, which Next.js installs as an optional dependency.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join } from 'node:path';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });
// Next.js turns src/app/apple-icon.png into the Apple touch icon by itself.
const appleIconPath = join(root, 'src', 'app', 'apple-icon.png');

const BLUE = '#2457c5';
const RECEIPT = 'M12 8h16v24l-2.7-2-2.6 2-2.7-2-2.7 2-2.7-2-2.6 2z';
const CHECK = 'M16.5 19.5l2.8 2.8 5.2-5.6';

const mark = `<path d="${RECEIPT}" fill="#ffffff"/><path d="${CHECK}" fill="none" stroke="${BLUE}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`;

// The mark on its rounded tile, as in the header and the favicon.
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="${BLUE}"/>${mark}</svg>`;

// The mark on a full square, smaller, so any shape the system cuts (circle, squircle) keeps it inside the
// safe zone (the central 80%).
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="${BLUE}"/><g transform="translate(6 6) scale(0.7)">${mark}</g></svg>`;

const files = [
  ['icon-192.png', rounded, 192],
  ['icon-512.png', rounded, 512],
  ['icon-maskable-512.png', maskable, 512],
  [appleIconPath, maskable, 180],
];

for (const [name, svg, size] of files) {
  const png = await sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png().toBuffer();
  writeFileSync(isAbsolute(name) ? name : join(outDir, name), png);
  console.log(`${name} ${size}x${size} ${png.length} bytes`);
}
