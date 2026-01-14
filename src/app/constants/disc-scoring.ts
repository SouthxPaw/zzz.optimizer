// Constants for disc scoring system
// Based on fribbels HSR optimizer approach using priority stats

/**
 * Diminishing returns configuration
 * Applied when a stat exceeds its optimal threshold
 */
export const DIMINISHING_RETURNS = {
  // Power function exponents for different stat types
  // Lower = more aggressive diminishing returns
  POWER: {
    STANDARD: 0.25,  // CRIT Rate, CRIT DMG, ATK%, etc. (mild diminishing)
    ENERGY: 0.20,    // Energy Regen (moderate diminishing)
  },
  // Threshold percentage - stats below this don't get diminishing returns
  // e.g., 0.80 = only apply diminishing returns if stat is above 80% of optimal
  THRESHOLD_PERCENT: 0.80,
};

/**
 * Breakpoint penalty configuration
 * Applied when a stat fails to meet its minimum or optimal threshold
 */
export const BREAKPOINT_PENALTIES = {
  // Penalty for missing minimum breakpoint (0-100%)
  MISSING_MIN: 0.30,  // 30% penalty if below minimum
  // Penalty for missing optimal breakpoint (0-100%)
  MISSING_OPTIMAL: 0.15,  // 15% penalty if between min and optimal
  // No penalty if at or above optimal
};

/**
 * Weight multipliers for external stat sources in build rating
 * These sources contribute to calculated stats but with reduced impact
 */
export const EXTERNAL_STAT_WEIGHTS = {
  WENGINE: 0.25,      // W-Engine stats contribute at 25% weight
  MINDSCAPE: 0.25,    // Mindscape stats contribute at 25% weight
};

/**
 * Component weights for composite build scoring
 * Must add up to 1.0 (100%)
 */
export const BUILD_SCORE_WEIGHTS = {
  BREAKPOINT: 0.20,      // 20% - Meeting stat breakpoints with progressive scoring
  DISC_QUALITY: 0.65,    // 65% - Average disc rating quality (MOST IMPORTANT)
  STAT_EFFICIENCY: 0.10, // 10% - Stat allocation efficiency
  SET_BONUS: 0.05,       // 5% - Set effect alignment
  DAMAGE_OUTPUT: 0.00,   // 0% - REMOVED (too unreliable, especially for supports)
};


/**
 * Main stat point bonuses
 * Gets bonus points for having optimal main stat for the slot
 */
export const MAIN_STAT_BONUS: { [slot: string]: { [stat: string]: number } } = {
  'Drive4': {
    'CRIT_Rate': 3,
    'CRIT_DMG': 3,
    'ATK%': 2,
    'Anomaly_Proficiency': 2,
    'Impact': 2,
    'PEN_Ratio': 3,
  },
  'Drive5': {
    'ATK%': 2,
    'HP%': 2,
    'DEF%': 2,
    'PEN_Ratio': 3,
    'Element_DMG': 2,  // Element DMG on slot 5 is decent (middle of the road)
  },
  'Drive6': {
    'ATK%': 2,
    'Anomaly_Proficiency': 2,
    'Anomaly_Mastery': 2,
    'Energy_Regen': 2,
    'Impact': 2,
  }
};

/**
 * Disc rating thresholds based on total points
 * Updated with normalized grading (relative to realistic benchmarks)
 */
export interface DiscRating {
  grade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  minPoints: number;
  color: string;
  description: string;
}

export const DISC_RATING_THRESHOLDS: DiscRating[] = [
  { grade: 'SSS', minPoints: 90, color: '#FF6B9D', description: 'Perfect - God roll (near-perfect rolls)' },
  { grade: 'SS', minPoints: 70, color: '#FF8C42', description: 'Excellent - Amazing substats with high rolls' },
  { grade: 'S', minPoints: 50, color: '#FFD93D', description: 'Very Good - Great substats with good rolls' },
  { grade: 'A', minPoints: 35, color: '#6BCF7F', description: 'Good - Solid substats' },
  { grade: 'B', minPoints: 20, color: '#4D96FF', description: 'Decent - Okay substats' },
  { grade: 'C', minPoints: 10, color: '#A0A0A0', description: 'Below Average - Mediocre substats' },
  { grade: 'D', minPoints: 5, color: '#808080', description: 'Poor - Mostly wasted substats' },
  { grade: 'F', minPoints: 0, color: '#606060', description: 'Unusable - All wasted substats (fodder)' },
];

/**
 * Build rating thresholds based on stat breakpoints
 * Balanced to be challenging yet achievable with good disc farming
 * These thresholds reward quality builds while maintaining meaningful progression
 */
export interface BuildRating {
  grade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  breakpointsMetPercentage: number;  // Percentage of optimal breakpoints met
  color: string;
  description: string;
}

export const BUILD_RATING_THRESHOLDS: BuildRating[] = [
  { grade: 'SSS', breakpointsMetPercentage: 78, color: '#FF6B9D', description: 'Perfect - God-tier build with near-perfect discs' },
  { grade: 'SS', breakpointsMetPercentage: 70, color: '#FF8C42', description: 'Excellent - Outstanding build with great discs' },
  { grade: 'S', breakpointsMetPercentage: 64, color: '#FFD93D', description: 'Very Good - Strong build with good discs' },
  { grade: 'A', breakpointsMetPercentage: 55, color: '#6BCF7F', description: 'Good - Solid build with decent discs' },
  { grade: 'B', breakpointsMetPercentage: 43, color: '#4D96FF', description: 'Decent - Room for improvement' },
  { grade: 'C', breakpointsMetPercentage: 30, color: '#A0A0A0', description: 'Below Average - Missing key stats' },
  { grade: 'D', breakpointsMetPercentage: 18, color: '#808080', description: 'Poor - Major gaps in stats' },
  { grade: 'F', breakpointsMetPercentage: 0, color: '#606060', description: 'Unoptimized - Needs complete rework' },
];
