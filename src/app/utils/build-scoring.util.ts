/**
 * Shared build scoring utilities
 * Used by optimizer service and worker to calculate simple weighted scores
 */

import { BaseStats, DiscSlot } from '../models/agent.model';
import { Disc } from '../models/disc.model';
import { ScoringAlgorithm } from '../models/scoring.model';

/**
 * Calculate simple weighted build score for optimization
 * This is a lightweight scoring function used during build optimization
 * For comprehensive scoring with breakpoints, use ScoringService.calculateBuildScore()
 */
export function calculateWeightedBuildScore(
  stats: BaseStats,
  discs: { [key in DiscSlot]?: Disc },
  algorithm: ScoringAlgorithm,
  getSetBonuses: (discs: { [key in DiscSlot]?: Disc }) => string[]
): number {
  let score = 0;

  // Weight stats according to algorithm
  Object.entries(algorithm.weights).forEach(([statType, weight]) => {
    const statValue = getStatValueFromType(stats, statType);
    score += statValue * weight;
  });

  // Bonus for set bonuses
  const setBonus = getSetBonuses(discs);
  if (setBonus.some(b => b.includes('(4)'))) {
    score *= 1.15; // 15% bonus for 4-piece sets
  }

  return score;
}

/**
 * Get stat value by type string
 */
export function getStatValueFromType(stats: BaseStats, statType: string): number {
  switch(statType) {
    case 'HP': return stats.hp;
    case 'HP%': return stats.hppercent;
    case 'ATK': return stats.atk;
    case 'ATK%': return stats.atkpercent;
    case 'DEF': return stats.def;
    case 'DEF%': return stats.defpercent;
    case 'CRIT_Rate': return stats.critRate;
    case 'CRIT_DMG': return stats.critDmg;
    case 'Anomaly_Proficiency': return stats.anomalyProficiency;
    case 'Anomaly_Mastery': return stats.anomalyMastery;
    case 'PEN': return stats.pen;
    case 'PEN_Ratio': return stats.penRatio;
    case 'Energy_Regen': return stats.energyRegen;
    case 'Impact': return stats.impact;
    default: return 0;
  }
}
