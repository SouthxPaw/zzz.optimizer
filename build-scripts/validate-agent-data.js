/**
 * Validates that per-agent data files stay in sync with agents.json.
 *
 * Catches two failure modes that are both valid JSON, invisible in an editor,
 * and silent at runtime - the agent just scores as INCOMPLETE with no
 * breakpoints, which reads like a scoring bug instead of a data typo:
 *
 *   1. An agent entry nested at the wrong level (a sibling of "agents" rather
 *      than inside it). Roxy (1621) shipped this way in agent-breakpoints.json.
 *   2. An agent in agents.json with no entry in a data file at all.
 *
 * Runs as part of `npm run build`. Exits non-zero on any problem.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'src', 'assets', 'data');

// Files keyed by agent ID inside a single container object.
const AGENT_KEYED_FILES = [
  { file: 'agent-breakpoints.json', container: 'agents', requireFullCoverage: true },
  { file: 'agent-stat-weights.json', container: 'agents', requireFullCoverage: true },
  // Mindscape bonuses only exist for agents that have them, so no coverage rule.
  { file: 'mindscape-stats.json', container: 'mindscapes', requireFullCoverage: false },
];

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, fileName), 'utf8'));
}

function validate() {
  const errors = [];

  const agents = readJson('agents.json');
  if (!Array.isArray(agents)) {
    errors.push('agents.json: expected a top-level array of agents.');
    return errors;
  }

  const agentIds = agents.map(a => String(a.id));
  const agentNames = new Map(agents.map(a => [String(a.id), a.name]));

  for (const { file, container, requireFullCoverage } of AGENT_KEYED_FILES) {
    let data;
    try {
      data = readJson(file);
    } catch (err) {
      errors.push(`${file}: could not be parsed - ${err.message}`);
      continue;
    }

    const entries = data[container];
    if (!entries || typeof entries !== 'object') {
      errors.push(`${file}: missing the "${container}" object.`);
      continue;
    }

    // 1. Entries sitting outside the container object.
    const strays = Object.keys(data).filter(key => /^\d+$/.test(key));
    for (const stray of strays) {
      const name = agentNames.get(stray) || 'unknown agent';
      errors.push(
        `${file}: entry "${stray}" (${name}) is at the top level of the file ` +
          `instead of inside "${container}", so it will be ignored at runtime. ` +
          `Move it inside the "${container}" object.`
      );
    }

    // 2. Agents with no entry at all.
    if (requireFullCoverage) {
      const missing = agentIds.filter(id => !entries[id] && !strays.includes(id));
      for (const id of missing) {
        errors.push(`${file}: no entry for agent ${id} (${agentNames.get(id)}).`);
      }
    }

    // 3. Entries for agents that no longer exist.
    const orphans = Object.keys(entries).filter(id => !agentIds.includes(id));
    for (const orphan of orphans) {
      errors.push(`${file}: entry "${orphan}" does not match any agent in agents.json.`);
    }
  }

  return errors;
}

const errors = validate();

if (errors.length > 0) {
  console.error(`\nAgent data validation failed (${errors.length} problem${errors.length > 1 ? 's' : ''}):\n`);
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  console.error('');
  process.exit(1);
}

console.log('Agent data validation passed.');
