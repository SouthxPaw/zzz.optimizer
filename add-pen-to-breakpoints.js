const fs = require('fs');
const path = require('path');

// Read the agent-breakpoints.json file
const filePath = path.join(__dirname, 'src', 'assets', 'data', 'agent-breakpoints.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// Add pen field to each agent's breakpoints (after anomalyProficiency, before penRatio)
for (const agentId in data.agents) {
  const agent = data.agents[agentId];

  // Create a new breakpoints object with pen inserted in the right place
  const oldBreakpoints = agent.breakpoints;
  const newBreakpoints = {
    hp: oldBreakpoints.hp,
    atk: oldBreakpoints.atk,
    def: oldBreakpoints.def,
    impact: oldBreakpoints.impact,
    anomalyMastery: oldBreakpoints.anomalyMastery,
    critRate: oldBreakpoints.critRate,
    critDmg: oldBreakpoints.critDmg,
    anomalyProficiency: oldBreakpoints.anomalyProficiency,
    pen: { min: 0, optimal: 0 },  // Add pen with default values
    penRatio: oldBreakpoints.penRatio,
    energyRegen: oldBreakpoints.energyRegen
  };

  agent.breakpoints = newBreakpoints;

  // Add PEN to discWeights if it doesn't exist
  if (!agent.discWeights.PEN) {
    agent.discWeights.PEN = 0;
  }
}

// Write the updated data back to the file
fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

console.log('Successfully added PEN field to all agent breakpoints!');
console.log('Also added PEN to discWeights where missing.');
