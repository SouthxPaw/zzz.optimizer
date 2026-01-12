const fs = require('fs');
const path = require('path');

// Read the agent-breakpoints.json file
const filePath = path.join(__dirname, 'src', 'assets', 'data', 'agent-breakpoints.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// Stats that should be converted from display format (70) to decimal format (0.70)
const percentageStats = ['critRate', 'critDmg', 'penRatio', 'energyRegen'];

// Convert each agent's breakpoints
for (const agentId in data.agents) {
  const agent = data.agents[agentId];
  const breakpoints = agent.breakpoints;

  for (const statKey of percentageStats) {
    if (breakpoints[statKey]) {
      // Convert from percentage (e.g., 70) to decimal (e.g., 0.70)
      breakpoints[statKey].min = breakpoints[statKey].min / 100;
      breakpoints[statKey].optimal = breakpoints[statKey].optimal / 100;
    }
  }
}

// Write the converted data back to the file
fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

console.log('Successfully converted agent breakpoints to decimal format!');
console.log('Converted stats: critRate, critDmg, penRatio, energyRegen');
