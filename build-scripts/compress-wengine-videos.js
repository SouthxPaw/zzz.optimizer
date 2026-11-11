/**
 * Re-encodes the animated W-Engine icons to something proportionate to how
 * they are displayed.
 *
 * The source files come from the game data dump at 720x720, 60 fps, ~4 Mbps,
 * 10 seconds - up to 9 MB each, 410 MB for the set. They are rendered in a
 * 80x80 CSS box (.wengine-icon), so roughly 98.8% of the decoded pixels are
 * thrown away. On a normal connection a single icon can take over 15 seconds
 * to arrive, which is why the animation appears late or not at all.
 *
 * Output targets 240x240 at 30 fps: 3x the display size, so it stays crisp on
 * high-DPI screens and if the layout grows, while cutting the payload ~88%.
 *
 * Originals are never modified. Encoded files land in a separate directory so
 * the two can be compared before anything is swapped in.
 *
 * Usage:
 *   node build-scripts/compress-wengine-videos.js --sample    # 3 files, for review
 *   node build-scripts/compress-wengine-videos.js             # all files
 *   node build-scripts/compress-wengine-videos.js --apply     # replace originals
 *                                                              (originals moved to
 *                                                               wengine-gifs-original/)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync, execFileSync: run } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'src', 'assets', 'data', 'images', 'wengine-gifs');
const OUTPUT_DIR = path.join(ROOT, 'src', 'assets', 'data', 'images', 'wengine-gifs-compressed');
const BACKUP_DIR = path.join(ROOT, 'src', 'assets', 'data', 'images', 'wengine-gifs-original');

/**
 * 4x the 80px display box, so the icons stay sharp on high-DPI screens.
 *
 * An earlier pass used 240px at CRF 30 and the result was visibly bad - these
 * are detailed, high-contrast weapon renders, and aggressive quantisation
 * shows immediately. CRF 20 at 320px keeps them clean while still removing
 * most of the weight, since the bulk of the saving comes from dropping 720p
 * and 60 fps rather than from quantisation.
 */
const TARGET_SIZE = 320;
const TARGET_FPS = 24;
/** Constant Rate Factor: lower is better quality. 20 is visually clean here. */
const CRF = 20;

function fail(message) {
  console.error(`[compress-wengine-videos] ${message}`);
  process.exit(1);
}

function checkFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'pipe' });
  } catch {
    fail('ffmpeg not found on PATH. Install it and retry.');
  }
}

const mb = n => (n / 1048576).toFixed(2);

function encode(sourceFile, destFile) {
  run('ffmpeg', [
    '-y',
    '-v', 'error',
    // The sources are VP9 in an MP4 container. ffmpeg's automatic decoder
    // selection mis-handles that combination and emits a file that looks
    // plausible - right size, right duration, no error exit - but whose H.264
    // bitstream is corrupt and will not play in any browser. Naming the
    // decoder explicitly produces a valid re-encode.
    '-c:v', 'libvpx-vp9',
    '-i', sourceFile,
    '-vf', `scale=${TARGET_SIZE}:${TARGET_SIZE}:flags=lanczos,fps=${TARGET_FPS}`,
    '-c:v', 'libx264',
    '-crf', String(CRF),
    '-preset', 'slow',
    '-pix_fmt', 'yuv420p',
    // Puts the MP4 index at the front so playback can start before the whole
    // file has arrived.
    '-movflags', '+faststart',
    // These icons are silent; any audio track is pure overhead.
    '-an',
    destFile,
  ], { stdio: 'pipe' });

  verify(destFile);
}

/**
 * Decode the encoded file end to end and reject it if anything errors.
 *
 * ffmpeg can exit 0 having written a file whose bitstream is unplayable, so
 * file size and exit code are not evidence that the encode worked. The only
 * reliable check is a full decode. Without this, a broken batch gets applied
 * and the breakage is first discovered by the user, in the browser, after the
 * originals have already been moved aside.
 */
function verify(file) {
  let stderr = '';
  try {
    execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    stderr = (error.stderr || '').toString();
  }

  if (stderr.trim()) {
    fs.unlinkSync(file);
    throw new Error(`decoded with errors, output discarded:\n    ${stderr.trim().split('\n')[0]}`);
  }
}

function main() {
  checkFfmpeg();

  const args = process.argv.slice(2);
  const sampleOnly = args.includes('--sample');
  const apply = args.includes('--apply');

  if (!fs.existsSync(SOURCE_DIR)) {
    fail(`Source directory not found: ${SOURCE_DIR}`);
  }

  if (apply) {
    if (!fs.existsSync(OUTPUT_DIR)) {
      fail('Nothing to apply - run without --apply first to encode the files.');
    }
    if (fs.existsSync(BACKUP_DIR)) {
      fail(`Backup directory already exists: ${BACKUP_DIR}. Remove or rename it first.`);
    }

    // Refuse to swap in a partial set. An interrupted encode leaves fewer
    // files than the source, and applying it would silently delete the
    // animations that had not been reached yet.
    const sourceCount = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith('.mp4')).length;
    const encodedCount = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.mp4')).length;
    if (encodedCount !== sourceCount) {
      fail(
        `Encoded set is incomplete: ${encodedCount} of ${sourceCount} files. ` +
        'Re-run without --apply to finish, then apply.'
      );
    }

    // Move originals aside, then move the encoded set into place.
    fs.renameSync(SOURCE_DIR, BACKUP_DIR);
    fs.renameSync(OUTPUT_DIR, SOURCE_DIR);
    console.log(`[compress-wengine-videos] originals moved to ${path.relative(ROOT, BACKUP_DIR)}`);
    console.log('[compress-wengine-videos] compressed set is now live. Verify, then delete the backup.');
    return;
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let files = fs.readdirSync(SOURCE_DIR).filter(f => f.toLowerCase().endsWith('.mp4'));
  if (files.length === 0) {
    fail(`No .mp4 files found in ${SOURCE_DIR}`);
  }

  if (sampleOnly) {
    // Largest few, so the review looks at the worst cases.
    files = files
      .map(f => ({ f, size: fs.statSync(path.join(SOURCE_DIR, f)).size }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 3)
      .map(x => x.f);
    console.log(`[compress-wengine-videos] sample mode: ${files.join(', ')}\n`);
  }

  let totalBefore = 0;
  let totalAfter = 0;

  files.forEach((file, i) => {
    const source = path.join(SOURCE_DIR, file);
    const dest = path.join(OUTPUT_DIR, file);

    const before = fs.statSync(source).size;

    // Resume support: encoding the full set takes a while, and an interrupted
    // run should not start from scratch. A non-empty output file is treated as
    // already done - ffmpeg only writes its output once the encode succeeds.
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      const existing = fs.statSync(dest).size;
      totalBefore += before;
      totalAfter += existing;
      console.log(`[${String(i + 1).padStart(3)}/${files.length}] ${file.padEnd(28)} already encoded, skipping`);
      return;
    }

    try {
      encode(source, dest);
    } catch (error) {
      console.error(`  FAILED ${file}: ${error.message}`);
      return;
    }
    const after = fs.statSync(dest).size;

    totalBefore += before;
    totalAfter += after;

    const pct = ((1 - after / before) * 100).toFixed(1);
    const progress = `[${String(i + 1).padStart(3)}/${files.length}]`;
    console.log(`${progress} ${file.padEnd(28)} ${mb(before)} MB -> ${mb(after)} MB  (-${pct}%)`);
  });

  console.log(
    `\n[compress-wengine-videos] total ${mb(totalBefore)} MB -> ${mb(totalAfter)} MB ` +
    `(-${((1 - totalAfter / totalBefore) * 100).toFixed(1)}%)`
  );
  console.log(`[compress-wengine-videos] output: ${path.relative(ROOT, OUTPUT_DIR)}`);
  if (!sampleOnly) {
    console.log('[compress-wengine-videos] review the files, then re-run with --apply to swap them in.');
  }
}

main();
