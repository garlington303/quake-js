/**
 * extract-pak.mjs
 * Extracts files from a Quake PAK archive.
 *
 * Usage:
 *   node scripts/extract-pak.mjs <pak-file> [filter-prefix]
 *
 * Examples:
 *   node scripts/extract-pak.mjs "D:/Games/QUAKE/Quake/id1/PAK0.PAK" progs/
 *   node scripts/extract-pak.mjs "D:/Games/QUAKE/Quake/id1/PAK1.PAK" progs/
 *
 * Output goes to public/pak-extracted/<entry-name>
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_BASE = join(__dirname, "..", "public", "pak-extracted");

const [, , pakPath, filterPrefix = ""] = process.argv;

if (!pakPath) {
  console.error("Usage: node extract-pak.mjs <pak-file> [filter-prefix]");
  process.exit(1);
}

const buf = readFileSync(pakPath);

// PAK header
const magic = buf.toString("ascii", 0, 4);
if (magic !== "PACK") {
  console.error(`Not a PAK file (magic = "${magic}")`);
  process.exit(1);
}

const dirOffset = buf.readUInt32LE(4);
const dirLength = buf.readUInt32LE(8);
const entryCount = dirLength / 64;

console.log(`PAK: ${entryCount} entries, dir at offset ${dirOffset}`);

let extracted = 0;
let skipped = 0;

for (let i = 0; i < entryCount; i++) {
  const entryOffset = dirOffset + i * 64;

  // Name is null-terminated, up to 56 bytes
  let nameEnd = entryOffset;
  while (nameEnd < entryOffset + 56 && buf[nameEnd] !== 0) nameEnd++;
  const name = buf.toString("ascii", entryOffset, nameEnd);

  const fileOffset = buf.readUInt32LE(entryOffset + 56);
  const fileSize = buf.readUInt32LE(entryOffset + 60);

  if (filterPrefix && !name.startsWith(filterPrefix)) {
    skipped++;
    continue;
  }

  const outPath = join(OUTPUT_BASE, name.replace(/\//g, "/"));
  const outDir = dirname(outPath);

  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  const data = buf.subarray(fileOffset, fileOffset + fileSize);
  writeFileSync(outPath, data);
  console.log(`  extracted: ${name} (${fileSize} bytes)`);
  extracted++;
}

console.log(`\nDone. Extracted ${extracted}, skipped ${skipped}.`);
console.log(`Output: ${OUTPUT_BASE}`);
