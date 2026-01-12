const data = require('./src/assets/data/agent-breakpoints.json');

console.log('Checking all agents for data:\n');

for (const id in data.agents) {
  const agent = data.agents[id];
  const bp = agent.breakpoints;

  const hasData = bp.hp.min !== 0 || bp.hp.optimal !== 0 ||
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

  if (!hasData) {
    console.log(`${id} - ${agent.name}: ALL ZEROS (unfinished)`);
  }
}
