/**
 * Strips fields the app never reads out of agents.json before a build.
 *
 * agents.json is the upstream game data dump: ~1.4 MB, of which roughly 79% is
 * skill and passive text the optimizer does not use. Every visitor downloads
 * and JSON.parses all of it before the first agent can be shown.
 *
 * Both transform paths in data-transformer.service.ts build their result from
 * an explicit list of named fields rather than spreading the raw record, and
 * the Agent model has no property that could carry these fields, so dropping
 * them cannot change what the app stores or renders. See DROP vs KEEP below.
 *
 * WHY THIS RUNS BEFORE ng build, NOT AFTER:
 * agents.json is listed in the service worker's hash table (ngsw.json). Editing
 * the file after the build would leave the recorded hash pointing at content
 * that no longer exists, and the service worker rejects assets whose hash does
 * not match - the app would fail to load its own agent data. So the slimming
 * happens to the source file first, the build hashes the slimmed version, and
 * `restore` puts the full dump back in the working tree.
 *
 * Usage:
 *   node build-scripts/slim-agent-data.js slim       # stash full copy, write slim
 *   node build-scripts/slim-agent-data.js restore    # put the full copy back
 *   node build-scripts/slim-agent-data.js run -- <cmd...>
 *                                                    # slim, run cmd, always restore,
 *                                                    # and exit with cmd's status
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DATA_DIR = path.join(__dirname, '..', 'src', 'assets', 'data');
const TARGET = path.join(DATA_DIR, 'agents.json');
/** Full dump parked here while the slimmed file is in place. */
const BACKUP = path.join(DATA_DIR, 'agents.full.json');

/**
 * Fields removed from each agent record.
 *
 * Verified unread: no source reference, no dynamic property access on agent
 * records anywhere in src/app, and not required by validate-agent-data.js.
 */
const DROP_FIELDS = [
  'skills',      // ~51% of the file. Skill multipliers come from
                 // skill-parser.service.ts, which reads assets/data/character/*.json
                 // (a disabled feature), never this field.
  'passive',     // ~27% of the file. Passive *bonuses* are read from
                 // extra_ascension, which is kept.
  'potentials',  // No reference anywhere.
  'ascension',   // No reference anywhere. Not to be confused with
                 // extra_ascension, which IS read and IS kept.
];

/**
 * Fields that must survive, with the code that depends on them. Listed so a
 * future edit to DROP_FIELDS has to consciously step over them.
 */
const KEEP_FIELDS = {
  id: 'agent identity',
  name: 'agent identity',
  rarity: 'agent identity',
  element: 'data-mapping.service.ts',
  specialty: 'data-mapping.service.ts',
  lvl60_stats: 'data-transformer.service.ts extractLevel60Stats()',
  stats: 'data-transformer.service.ts extractLevel60Stats() (fallback path)',
  extra_ascension: 'data-transformer.service.ts - HP ascension detection (property 11102)',
  mindscape_cinemas: 'data-transformer.service.ts extractMindscapeEffects()',
  scoring: 'data-transformer.service.ts - buffs/debuffs/dazeBonus',
};

function fail(message) {
  console.error(`[slim-agent-data] ${message}`);
  process.exit(1);
}

const mb = n => (n / 1048576).toFixed(2);

function slim() {
  if (fs.existsSync(BACKUP)) {
    // A previous build was interrupted before restoring. The backup is the
    // real data, so recover from it rather than slimming an already-slim file.
    console.log('[slim-agent-data] found existing backup, restoring it first');
    fs.copyFileSync(BACKUP, TARGET);
    fs.unlinkSync(BACKUP);
  }

  if (!fs.existsSync(TARGET)) {
    fail(`Data file not found: ${TARGET}`);
  }

  const before = fs.statSync(TARGET).size;
  const agents = JSON.parse(fs.readFileSync(TARGET, 'utf8'));

  if (!Array.isArray(agents)) {
    fail('agents.json: expected a top-level array of agents.');
  }

  // Guard against silently slimming nothing - if upstream renames these
  // fields, the build should say so rather than quietly save nothing.
  const present = new Set();
  agents.forEach(agent => {
    if (!agent) return;
    DROP_FIELDS.forEach(field => {
      if (field in agent) present.add(field);
    });
  });
  if (present.size === 0) {
    fail(
      `None of the expected fields (${DROP_FIELDS.join(', ')}) were found. ` +
      'The upstream data shape may have changed - re-verify before adjusting DROP_FIELDS.'
    );
  }

  // Verify every keeper is still there before writing anything.
  const missingKeepers = Object.keys(KEEP_FIELDS).filter(
    field => !agents.some(agent => agent && field in agent)
  );
  if (missingKeepers.length > 0) {
    fail(
      `Required fields absent from every agent: ${missingKeepers.join(', ')}. ` +
      'Refusing to write a slimmed file that is missing data the app reads.'
    );
  }

  // Park the full dump before overwriting.
  fs.copyFileSync(TARGET, BACKUP);

  const slimmed = agents.map(agent => {
    if (!agent || typeof agent !== 'object') return agent;
    const copy = { ...agent };
    DROP_FIELDS.forEach(field => delete copy[field]);
    return copy;
  });

  fs.writeFileSync(TARGET, JSON.stringify(slimmed), 'utf8');

  const after = fs.statSync(TARGET).size;
  const saved = ((1 - after / before) * 100).toFixed(1);
  console.log(
    `[slim-agent-data] agents.json ${mb(before)} MB -> ${mb(after)} MB ` +
    `(-${saved}%, removed: ${[...present].join(', ')})`
  );
}

function restore() {
  if (!fs.existsSync(BACKUP)) {
    // Nothing to do - either slim was never run, or restore already ran.
    console.log('[slim-agent-data] no backup to restore, leaving agents.json as is');
    return;
  }
  fs.copyFileSync(BACKUP, TARGET);
  fs.unlinkSync(BACKUP);
  console.log(`[slim-agent-data] restored full agents.json (${mb(fs.statSync(TARGET).size)} MB)`);
}

/**
 * Slim, run the wrapped command, then restore no matter how it ended.
 *
 * Doing this here rather than as a shell `(build; restore)` keeps the build's
 * exit code intact - a shell sequence would report the restore's success and
 * mask a failed build, which would let a broken deploy through.
 */
function run(argv) {
  const command = argv[0];
  if (!command) {
    fail('run mode requires a command, e.g. `run -- ng build`.');
  }

  slim();

  // Passed as a single pre-joined string rather than (command, args) because
  // with shell:true the shell re-parses argv itself, and on Windows a bare
  // "/" argument (as in `--base-href /`) is mangled before the command sees
  // it. Arguments containing spaces are quoted here so they survive that
  // re-parse intact.
  const commandLine = argv
    .map(arg => (/\s/.test(arg) ? `"${arg}"` : arg))
    .join(' ');

  const result = spawnSync(commandLine, {
    stdio: 'inherit',
    shell: true,
  });

  restore();

  if (result.error) {
    fail(`Failed to launch "${command}": ${result.error.message}`);
  }
  // Preserve the wrapped command's outcome, including signal termination.
  process.exit(result.status === null ? 1 : result.status);
}

const mode = process.argv[2];
if (mode === 'slim') {
  slim();
} else if (mode === 'restore') {
  restore();
} else if (mode === 'run') {
  // Everything after an optional `--` separator is the command to run.
  const rest = process.argv.slice(3);
  run(rest[0] === '--' ? rest.slice(1) : rest);
} else {
  fail(`Unknown mode "${mode || ''}". Expected "slim", "restore" or "run".`);
}
