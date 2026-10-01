/**
 * Generate small thumbnails for the agent portraits.
 *
 * The Add Agent modal and the build list render agent portraits in cells around
 * 120-200px wide, but the source art is roughly 1800x2600. Without thumbnails
 * the modal downloads ~21MB to fill 60 small cells, and the browser then
 * rescales 60 multi-megapixel bitmaps on every scroll frame. Both the slow load
 * and the janky scrolling come from that.
 *
 * Output goes to images/agents/thumbs/ using the same filenames, so the app can
 * derive a thumbnail path from the full-size one by inserting "thumbs/".
 * Full-size art is left untouched - the build detail view still uses it.
 *
 * Usage: node build-scripts/generate-agent-thumbnails.js [--force]
 *
 * Skips files whose thumbnail is already newer than the source, so re-runs are
 * cheap. Pass --force to regenerate everything (e.g. after changing SIZE).
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Sizing is driven by the WIDTH the thumbnail has to fill, not by the `width="60"`
// attribute on the <img> - that attribute only reserves layout space and is
// overridden by CSS.
//
// Real display sizes (character-tab.component.css):
//   .agent-grid      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr))
//   .agent-portrait  height: 140px
//   .agent-icon      width/height 100% + object-fit: cover  -> fills the cell
//
// So a cell is 120px wide at minimum and stretches wider on large screens. At
// 3x for high-DPI that is ~360px+, and because `cover` crops rather than fits,
// the WIDTH is what must be satisfied. Constraining the long edge (height) of a
// ~1:1.4 portrait would leave the width far too small and the image visibly
// upscaled - that is what 120 did.
const WIDTH = 400;
const QUALITY = 80;

const SOURCE_DIR = path.join(__dirname, '..', 'src', 'assets', 'data', 'images', 'agents');
const THUMB_DIR = path.join(SOURCE_DIR, 'thumbs');

const force = process.argv.includes('--force');

/**
 * True when an existing thumbnail is already at the width this script would
 * produce for that source.
 *
 * Because resize() passes withoutEnlargement, a source narrower than WIDTH is
 * left at its own width - so the expected width is min(WIDTH, sourceWidth),
 * not WIDTH unconditionally. Comparing against a flat WIDTH would put such a
 * thumbnail in a permanent rebuild loop.
 *
 * Unreadable metadata returns false so the thumbnail gets regenerated; that
 * path then reports a real error instead of silently skipping.
 */
async function isCorrectWidth(thumbPath, sourcePath) {
  try {
    // Read bytes first and hand sharp a buffer. sharp(path).metadata() keeps a
    // handle on the file, which later blocks writing to that same path on
    // Windows ("unable to open for write"). A buffer leaves no handle behind.
    const [thumbMeta, sourceMeta] = await Promise.all([
      sharp(fs.readFileSync(thumbPath)).metadata(),
      sharp(fs.readFileSync(sourcePath)).metadata(),
    ]);
    if (!thumbMeta.width || !sourceMeta.width) return false;
    return thumbMeta.width === Math.min(WIDTH, sourceMeta.width);
  } catch {
    return false;
  }
}

async function main() {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`Source directory not found: ${SOURCE_DIR}`);
    process.exit(1);
  }

  fs.mkdirSync(THUMB_DIR, { recursive: true });

  // Only top-level files - never recurse into thumbs/ itself.
  const sources = fs
    .readdirSync(SOURCE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(webp|png|jpg|jpeg)$/i.test(entry.name))
    .map((entry) => entry.name);

  if (sources.length === 0) {
    console.error(`No source images found in ${SOURCE_DIR}`);
    process.exit(1);
  }

  let written = 0;
  let skipped = 0;
  let failed = 0;
  let sourceBytes = 0;
  let thumbBytes = 0;

  for (const name of sources) {
    const sourcePath = path.join(SOURCE_DIR, name);

    // Always emit .webp regardless of what the source actually is. At least one
    // portrait is a PNG carrying a .webp extension, so the extension cannot be
    // trusted - re-encoding normalises them all.
    const thumbName = name.replace(/\.(webp|png|jpg|jpeg)$/i, '.webp');
    const thumbPath = path.join(THUMB_DIR, thumbName);

    const sourceStat = fs.statSync(sourcePath);
    sourceBytes += sourceStat.size;

    if (!force && fs.existsSync(thumbPath)) {
      const thumbStat = fs.statSync(thumbPath);
      // mtime alone is not enough. A thumbnail committed alongside its source -
      // which is how a new agent normally arrives - is already "newer" than the
      // source, so an mtime-only check skips it forever and whatever size it
      // happened to ship with sticks. Roxy reached production at 67px that way.
      // Verify the actual width so an off-spec thumbnail is always rebuilt.
      if (thumbStat.mtimeMs >= sourceStat.mtimeMs && (await isCorrectWidth(thumbPath, sourcePath))) {
        thumbBytes += thumbStat.size;
        skipped++;
        continue;
      }
    }

    try {
      // Encode to a buffer, then write. Going straight to toFile() can fail with
      // "unable to open for write" on Windows when sharp still holds a handle on
      // the path it is writing - which happens whenever a thumbnail is being
      // replaced in place rather than created fresh.
      const buffer = await sharp(fs.readFileSync(sourcePath))
        // Constrain WIDTH only and let the height follow the aspect ratio.
        // Passing null for height avoids bounding the long edge, which on a tall
        // portrait would shrink the width well below what the grid cell needs.
        .resize(WIDTH, null, { withoutEnlargement: true })
        .webp({ quality: QUALITY })
        .toBuffer();

      fs.writeFileSync(thumbPath, buffer);

      thumbBytes += fs.statSync(thumbPath).size;
      written++;
    } catch (error) {
      // Keep going - one unreadable source should not block the rest, and the
      // app falls back to the full-size image when a thumbnail is missing.
      console.warn(`  ! failed: ${name} - ${error.message}`);
      failed++;
    }
  }

  const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2);

  console.log(`Agent thumbnails -> ${path.relative(process.cwd(), THUMB_DIR)}`);
  console.log(`  generated: ${written}   unchanged: ${skipped}   failed: ${failed}`);
  console.log(`  full-size: ${mb(sourceBytes)} MB   thumbnails: ${mb(thumbBytes)} MB`);

  if (thumbBytes > 0) {
    console.log(`  reduction: ${(sourceBytes / thumbBytes).toFixed(1)}x smaller`);
  }

  // A missing thumbnail only costs a slow fallback, so partial failure is not
  // fatal. A total failure means something is wrong with sharp or the sources.
  if (failed > 0 && written === 0 && skipped === 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
