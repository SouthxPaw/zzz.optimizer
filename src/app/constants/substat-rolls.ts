/**
 * ZZZ Disc Substat Roll Values
 *
 * In ZZZ, substat upgrades are STATIC - each roll always gives the same amount.
 * This differs from HSR where rolls have min/max ranges.
 *
 * Data source: https://www.prydwen.gg/zenless/guides/disk-drives-stats/
 * Verified: 2026-01-13
 */

/**
 * Static roll values per substat type
 * Each upgrade grants exactly this amount
 */
export const SUBSTAT_ROLL_VALUES: { [statType: string]: number } = {
  'CRIT_Rate': 2.4,           // +2.4% per roll
  'CRIT_DMG': 4.8,            // +4.8% per roll
  'ATK%': 3.0,                // +3.0% per roll
  'HP%': 3.0,                 // +3.0% per roll
  'DEF%': 4.8,                // +4.8% per roll
  'ATK': 19,                  // +19 flat ATK per roll
  'HP': 112,                  // +112 flat HP per roll
  'DEF': 15,                  // +15 flat DEF per roll (S-Rank)
  'PEN': 9,                   // +9 flat PEN per roll
  'Anomaly_Proficiency': 9,   // +9 flat Anomaly Proficiency per roll
  'Anomaly_Mastery': 0,       // Main stat only (Disc 6) - does not roll as substat
  'Impact': 0,                // Main stat only (Disc 6) - does not roll as substat
  'Energy_Regen': 0,          // Main stat only (Disc 6) - does not roll as substat
  'PEN_Ratio': 0,             // Not documented in source (main stat only?)
};

/**
 * Calculate how many rolls (upgrades) a substat has received
 *
 * @param statType - The type of stat (e.g., 'CRIT_Rate')
 * @param currentValue - The current total value of the stat
 * @returns Number of rolls this stat has received (rounded)
 */
export function calculateRollCount(statType: string, currentValue: number): number {
  const rollValue = SUBSTAT_ROLL_VALUES[statType];

  if (!rollValue || rollValue === 0) {
    return 0; // Unknown stat type or not rollable
  }

  // Divide current value by roll value to get roll count
  // Round to nearest integer since rolls are discrete
  return Math.round(currentValue / rollValue);
}

/**
 * Calculate the theoretical maximum value for a substat
 *
 * S-Rank discs can have up to 5 upgrades (at levels 3, 6, 9, 12, 15)
 * Plus 1 initial roll if the stat started on the disc
 *
 * @param statType - The type of stat
 * @param maxRolls - Maximum number of rolls (default 6: 1 initial + 5 upgrades)
 * @returns Maximum possible value for this stat
 */
export function calculateMaxValue(statType: string, maxRolls: number = 6): number {
  const rollValue = SUBSTAT_ROLL_VALUES[statType];

  if (!rollValue || rollValue === 0) {
    return 0;
  }

  return rollValue * maxRolls;
}

/**
 * Roll efficiency tiers for quality assessment
 */
export const ROLL_EFFICIENCY_TIERS = {
  PERFECT: { min: 6, label: 'Perfect', color: '#FF6B9D' },      // 6 rolls (maxed)
  EXCELLENT: { min: 5, label: 'Excellent', color: '#FF8C42' },  // 5 rolls
  GOOD: { min: 4, label: 'Good', color: '#FFD93D' },           // 4 rolls
  AVERAGE: { min: 3, label: 'Average', color: '#6BCF7F' },     // 3 rolls
  BELOW: { min: 2, label: 'Below Avg', color: '#4D96FF' },     // 2 rolls
  POOR: { min: 1, label: 'Poor', color: '#A0A0A0' },           // 1 roll
  MINIMAL: { min: 0, label: 'Minimal', color: '#606060' }      // 0 rolls (initial only)
};

/**
 * Get roll efficiency tier for a given roll count
 */
export function getRollEfficiencyTier(rollCount: number): { min: number, label: string, color: string } {
  if (rollCount >= 6) return ROLL_EFFICIENCY_TIERS.PERFECT;
  if (rollCount >= 5) return ROLL_EFFICIENCY_TIERS.EXCELLENT;
  if (rollCount >= 4) return ROLL_EFFICIENCY_TIERS.GOOD;
  if (rollCount >= 3) return ROLL_EFFICIENCY_TIERS.AVERAGE;
  if (rollCount >= 2) return ROLL_EFFICIENCY_TIERS.BELOW;
  if (rollCount >= 1) return ROLL_EFFICIENCY_TIERS.POOR;
  return ROLL_EFFICIENCY_TIERS.MINIMAL;
}
