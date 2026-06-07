// Analyze Hugo and Orphie disc scoring

const fs = require('fs');

// Load agent stat weights
const statWeights = JSON.parse(fs.readFileSync('c:/zzz.optimizer/src/assets/data/agent-stat-weights.json', 'utf8'));

// Find Hugo's ID and stat weights
const hugoId = Object.keys(statWeights.agents).find(id => {
  return statWeights.agents[id].name === 'Hugo';
});

console.log('\n=== HUGO ANALYSIS ===');
console.log('Hugo ID:', hugoId);

if (hugoId) {
  const hugo = statWeights.agents[hugoId];
  console.log('\nBuilds available:', Object.keys(hugo.builds));

  // Look at CRIT build for D1 (flat HP main) and D2 (flat ATK main)
  const critBuild = hugo.builds.CRIT;

  console.log('\n--- D1 (HP main stat) weights ---');
  const d1Weights = critBuild.contextualWeights?.Drive1?.HP;
  if (d1Weights) {
    console.log('Main stat points:', d1Weights.mainStatPoints);
    console.log('Substat weights:', d1Weights.substatWeights);
  }

  console.log('\n--- D2 (ATK main stat) weights ---');
  const d2Weights = critBuild.contextualWeights?.Drive2?.ATK;
  if (d2Weights) {
    console.log('Main stat points:', d2Weights.mainStatPoints);
    console.log('Substat weights:', d2Weights.substatWeights);
  }
}

// Function to calculate roll count (simplified - mirrors the real calculation)
function calculateRollCount(statType, value) {
  const rollValues = {
    'ATK%': 3.0,
    'DEF': 19,
    'CRIT_DMG': 4.8,
    'CRIT_Rate': 2.4,
    'Anomaly_Proficiency': 3.0,
    'ATK': 13,
  };

  const baseRoll = rollValues[statType] || 1;
  return Math.round(value / baseRoll);
}

// Hugo D1 disc
console.log('\n\n=== HUGO D1 SCORING ===');
console.log('Main stat: HP (flat)');
console.log('Substats:');
const d1Substats = [
  { type: 'ATK%', value: 6 },
  { type: 'DEF', value: 15 },
  { type: 'CRIT_DMG', value: 9.6 },
  { type: 'CRIT_Rate', value: 7.2 }
];

d1Substats.forEach(sub => {
  const rolls = calculateRollCount(sub.type, sub.value);
  console.log(`  ${sub.type}: ${sub.value} (${rolls} rolls)`);
});

if (hugoId) {
  const hugo = statWeights.agents[hugoId];
  const d1Weights = hugo.builds.CRIT.contextualWeights?.Drive1?.HP?.substatWeights;

  console.log('\nPoint calculation:');
  const multiplier = 3.0; // Standard multiplier for weight range
  let totalPoints = 3; // Main stat points

  d1Substats.forEach(sub => {
    const rolls = calculateRollCount(sub.type, sub.value);
    const weight = d1Weights[sub.type] || 0;
    const points = rolls * weight * multiplier;
    totalPoints += points;
    console.log(`  ${sub.type}: ${rolls} rolls × ${weight} weight × ${multiplier} = ${points.toFixed(1)} points`);
  });

  console.log(`\nTotal points (before bonuses): ${totalPoints.toFixed(1)}`);
  console.log('Expected rating: SSS (114-117 points)');
}

// Hugo D2 disc
console.log('\n\n=== HUGO D2 SCORING ===');
console.log('Main stat: ATK (flat)');
console.log('Substats:');
const d2Substats = [
  { type: 'DEF', value: 30 },
  { type: 'CRIT_Rate', value: 12 },
  { type: 'CRIT_DMG', value: 4.8 },
  { type: 'Anomaly_Proficiency', value: 9 }
];

d2Substats.forEach(sub => {
  const rolls = calculateRollCount(sub.type, sub.value);
  console.log(`  ${sub.type}: ${sub.value} (${rolls} rolls)`);
});

if (hugoId) {
  const hugo = statWeights.agents[hugoId];
  const d2Weights = hugo.builds.CRIT.contextualWeights?.Drive2?.ATK?.substatWeights;

  console.log('\nPoint calculation:');
  const multiplier = 3.0;
  let totalPoints = 3; // Main stat points

  d2Substats.forEach(sub => {
    const rolls = calculateRollCount(sub.type, sub.value);
    const weight = d2Weights[sub.type] || 0;
    const points = rolls * weight * multiplier;
    totalPoints += points;
    console.log(`  ${sub.type}: ${rolls} rolls × ${weight} weight × ${multiplier} = ${points.toFixed(1)} points`);
  });

  // Check for god roll bonus
  let godRollBonus = 0;
  d2Substats.forEach(sub => {
    const rolls = calculateRollCount(sub.type, sub.value);
    const upgradeRolls = rolls - 1;
    const weight = d2Weights[sub.type] || 0;

    if (weight >= 1.0 && upgradeRolls >= 4) {
      console.log(`\n  God Roll Bonus: ${sub.type} has ${upgradeRolls} upgrade rolls (+11 points)`);
      godRollBonus = Math.max(godRollBonus, 11);
    }
  });

  totalPoints += godRollBonus;

  console.log(`\nTotal points (with bonuses): ${totalPoints.toFixed(1)}`);
  console.log('Expected rating: PHT (118+ points)');
}

// Look up Orphie
const orphieId = Object.keys(statWeights.agents).find(id => {
  return statWeights.agents[id].name === 'Orphie';
});

console.log('\n\n=== ORPHIE ANALYSIS ===');
console.log('Orphie ID:', orphieId || 'NOT FOUND');

if (orphieId) {
  const orphie = statWeights.agents[orphieId];
  console.log('Builds available:', Object.keys(orphie.builds));

  const critBuild = orphie.builds.CRIT;

  console.log('\n--- D6 (Energy Regen main stat) weights ---');
  const d6Weights = critBuild.contextualWeights?.Drive6?.Energy_Regen;
  if (d6Weights) {
    console.log('Main stat points:', d6Weights.mainStatPoints);
    console.log('Substat weights:', d6Weights.substatWeights);

    console.log('\n=== ORPHIE D6 SCORING ===');
    console.log('Main stat: Energy Regen');
    console.log('Substats:');
    const orphieSubstats = [
      { type: 'CRIT_DMG', value: 24 },
      { type: 'ATK', value: 19 },
      { type: 'ATK%', value: 3 },
      { type: 'CRIT_Rate', value: 2.4 }
    ];

    orphieSubstats.forEach(sub => {
      const rolls = calculateRollCount(sub.type, sub.value);
      console.log(`  ${sub.type}: ${sub.value} (${rolls} rolls)`);
    });

    console.log('\nPoint calculation:');
    const multiplier = 3.0;
    let totalPoints = d6Weights.mainStatPoints;

    orphieSubstats.forEach(sub => {
      const rolls = calculateRollCount(sub.type, sub.value);
      const weight = d6Weights.substatWeights[sub.type] || 0;
      const points = rolls * weight * multiplier;
      totalPoints += points;
      console.log(`  ${sub.type}: ${rolls} rolls × ${weight} weight × ${multiplier} = ${points.toFixed(1)} points`);
    });

    // Check for god roll bonus
    let godRollBonus = 0;
    orphieSubstats.forEach(sub => {
      const rolls = calculateRollCount(sub.type, sub.value);
      const upgradeRolls = rolls - 1;
      const weight = d6Weights.substatWeights[sub.type] || 0;

      if (weight >= 1.0 && upgradeRolls >= 4) {
        console.log(`\n  God Roll Bonus: ${sub.type} has ${upgradeRolls} upgrade rolls (+11 points)`);
        godRollBonus = Math.max(godRollBonus, 11);
      }
    });

    totalPoints += godRollBonus;

    console.log(`\nTotal points (with bonuses): ${totalPoints.toFixed(1)}`);
    console.log('Expected rating based on thresholds:');
    console.log('  VH: 134+');
    console.log('  PHT: 118-133');
    console.log('  SSS: 114-117');
  } else {
    console.log('No weights found for Energy Regen main stat on D6');
  }
} else {
  console.log('Orphie not found in stat weights - may be using default generic scoring');
}
