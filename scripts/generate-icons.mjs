// Rasterize the brand SVGs into the PNGs the manifest + iOS need.
// Run with: node scripts/generate-icons.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const jobs = [
  { src: "public/icon.svg", out: "public/icon-192.png", size: 192 },
  { src: "public/icon.svg", out: "public/icon-512.png", size: 512 },
  { src: "public/icon-maskable.svg", out: "public/icon-maskable-512.png", size: 512 },
  // iOS homescreen icon (opaque, full-bleed; iOS applies its own rounded mask).
  { src: "public/icon-maskable.svg", out: "src/app/apple-icon.png", size: 180, flatten: true },
];

for (const { src, out, size, flatten } of jobs) {
  const svg = await readFile(resolve(root, src));
  let img = sharp(svg, { density: 384 }).resize(size, size);
  // iOS apple-touch-icon should be opaque (no alpha) so it never composites oddly.
  if (flatten) img = img.flatten({ background: "#0a0b12" });
  const png = await img.png().toBuffer();
  await mkdir(dirname(resolve(root, out)), { recursive: true });
  await writeFile(resolve(root, out), png);
  console.log(`✓ ${out} (${size}×${size})`);
}
