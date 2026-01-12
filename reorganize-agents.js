const fs = require('fs');
const path = require('path');

// Read the agent-breakpoints.json file
const filePath = path.join(__dirname, 'src', 'assets', 'data', 'agent-breakpoints.json');
const rawText = fs.readFileSync(filePath, 'utf8');
const data = JSON.parse(rawText);

// Function to check if an agent is finished (has at least some non-zero breakpoints)
function isFinished(agent) {
  const bp = agent.breakpoints;
  return bp.hp.min !== 0 || bp.hp.optimal !== 0 ||
         bp.atk.min !== 0 || bp.atk.optimal !== 0 ||
         bp.def.min !== 0 || bp.def.optimal !== 0 ||
         bp.impact.min !== 0 || bp.impact.optimal !== 0 ||
         bp.anomalyMastery.min !== 0 || bp.anomalyMastery.optimal !== 0 ||
         bp.critRate.min !== 0 || bp.critRate.optimal !== 0 ||
         bp.critDmg.min !== 0 || bp.critDmg.optimal !== 0 ||
         bp.anomalyProficiency.min !== 0 || bp.anomalyProficiency.optimal !== 0 ||
         bp.pen.min !== 0 || bp.pen.optimal !== 0 ||
         bp.penRatio.min !== 0 || bp.penRatio.optimal !== 0 ||
         bp.energyRegen.min !== 0 || bp.energyRegen.optimal !== 0;
}

// Get all agent IDs and separate into finished and unfinished
const allAgentIds = Object.keys(data.agents);
const finishedIds = [];
const unfinishedIds = [];

for (const agentId of allAgentIds) {
  const agent = data.agents[agentId];
  if (isFinished(agent)) {
    finishedIds.push(agentId);
  } else {
    unfinishedIds.push(agentId);
  }
}

// Sort both arrays numerically
finishedIds.sort((a, b) => parseInt(a) - parseInt(b));
unfinishedIds.sort((a, b) => parseInt(a) - parseInt(b));

// Combine: finished first, then unfinished
const orderedIds = [...finishedIds, ...unfinishedIds];

// Manually construct the JSON with explicit ordering
let jsonOutput = '{\n';
jsonOutput += '  "comment": "Agent-specific stat breakpoints for build scoring. Fill in optimal stat targets for each agent. Use 0 for stats that do not matter.",\n';
jsonOutput += '  "agents": {\n';

orderedIds.forEach((agentId, index) => {
  const agent = data.agents[agentId];
  const isLast = index === orderedIds.length - 1;

  jsonOutput += `    "${agentId}": ${JSON.stringify(agent, null, 2).split('\n').map((line, i) => i === 0 ? line : '    ' + line).join('\n')}${isLast ? '\n' : ',\n'}`;
});

jsonOutput += '  }\n';
jsonOutput += '}\n';

// Write the updated data back to the file
fs.writeFileSync(filePath, jsonOutput, 'utf8');

console.log('Successfully reorganized agents!');
console.log(`Finished agents: ${finishedIds.length}`);
console.log(`Unfinished agents: ${unfinishedIds.length}`);
console.log('\nUnfinished agents moved to bottom:');
for (const agentId of unfinishedIds) {
  console.log(`  - ${data.agents[agentId].name} (${agentId})`);
}
