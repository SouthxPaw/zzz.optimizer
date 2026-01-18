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
    STANDARD: 0.5,   // CRIT Rate, CRIT DMG, ATK%, etc. (mild diminishing)
    ENERGY: 0.4,     // Energy Regen (moderate diminishing)
  },
  // Threshold percentage - stats below this don't get diminishing returns
  // 1.0 = only apply diminishing returns if stat is ABOVE optimal (at or below = no penalty)
  THRESHOLD_PERCENT: 1.0,
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
  DISC_QUALITY: 0.50,    // 50% - Average disc rating quality (MOST IMPORTANT)
  STAT_EFFICIENCY: 0.15, // 15% - Stat allocation efficiency (rewards smart building)
  SET_BONUS: 0.05,       // 5% - Set effect alignment
  DAMAGE_OUTPUT: 0.10,   // 10% - Damage calculation with agent/W-Engine scoring modifiers
};


/**
 * Main stat point bonuses
 * Gets bonus points for having optimal main stat for the slot
 * All viable main stats weighted equally at 3 points
 */
export const MAIN_STAT_BONUS: { [slot: string]: { [stat: string]: number } } = {
  'Drive4': {
    'CRIT_Rate': 3,
    'CRIT_DMG': 3,
    'ATK%': 3,
    'Anomaly_Proficiency': 3,
    'Impact': 3,
    'PEN_Ratio': 3,
  },
  'Drive5': {
    'ATK%': 3,
    'HP%': 3,
    'DEF%': 3,
    'PEN_Ratio': 3,
    'Element_DMG': 3,
  },
  'Drive6': {
    'ATK%': 3,
    'Anomaly_Proficiency': 3,
    'Anomaly_Mastery': 3,
    'Energy_Regen': 3,
    'Impact': 3,
  }
};

/**
 * Disc rating thresholds based on total points
 * Updated with normalized grading (relative to realistic benchmarks)
 */
export interface DiscRating {
  grade: 'VOID HUNTER' | 'LEGENDARY' | 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  minPoints: number;
  color: string;
  description: string;
}

export const DISC_RATING_THRESHOLDS: DiscRating[] = [
  { grade: 'VOID HUNTER', minPoints: 151, color: 'linear-gradient(135deg, #E0BBE4 0%, #957DAD 25%, #D291BC 50%, #FEC8D8 75%, #FFDFD3 100%)', description: 'Void Hunter - Absolute perfection (top 3% globally)' },
  { grade: 'LEGENDARY', minPoints: 148, color: 'linear-gradient(135deg, #FFD700 0%, #E5E4E2 33%, #B9F2FF 66%, #FFD700 100%)', description: 'Legendary - Near-perfect disc (top 5%)' },
  { grade: 'SSS', minPoints: 145, color: '#FF6B9D', description: 'Perfect - Outstanding disc (top 10%)' },
  { grade: 'SS', minPoints: 137, color: '#FF8C42', description: 'Excellent - Great disc (top 25%)' },
  { grade: 'S', minPoints: 117, color: '#FFD93D', description: 'Very Good - Above average disc (top 35%)' },
  { grade: 'A', minPoints: 98, color: '#6BCF7F', description: 'Good - Decent disc (top 60%)' },
  { grade: 'B', minPoints: 69, color: '#4D96FF', description: 'Average - Usable disc (top 80%)' },
  { grade: 'C', minPoints: 41, color: '#A0A0A0', description: 'Below Average - Needs upgrading (top 90%)' },
  { grade: 'D', minPoints: 13, color: '#808080', description: 'Poor - Consider replacing (top 95%)' },
  { grade: 'F', minPoints: 0, color: '#606060', description: 'Unusable - Immediate fodder' },
];

/**
 * Build rating thresholds based on stat breakpoints
 * Balanced to be challenging yet achievable with good disc farming
 * These thresholds reward quality builds while maintaining meaningful progression
 */
export interface BuildRating {
  grade: 'VOID HUNTER' | 'LEGENDARY' | 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  breakpointsMetPercentage: number;  // Percentage of optimal breakpoints met
  color: string;
  description: string;
}

export const BUILD_RATING_THRESHOLDS: BuildRating[] = [
  { grade: 'VOID HUNTER', breakpointsMetPercentage: 96, color: 'linear-gradient(135deg, #E0BBE4 0%, #957DAD 25%, #D291BC 50%, #FEC8D8 75%, #FFDFD3 100%)', description: 'Void Hunter - Perfect build with absolute best-in-slot discs (top 3%)' },
  { grade: 'LEGENDARY', breakpointsMetPercentage: 94, color: 'linear-gradient(135deg, #FFD700 0%, #E5E4E2 33%, #B9F2FF 66%, #FFD700 100%)', description: 'Legendary - Nearly perfect build with exceptional discs (top 5%)' },
  { grade: 'SSS', breakpointsMetPercentage: 91, color: '#FF6B9D', description: 'Perfect - God-tier build with near-perfect discs (top 10%)' },
  { grade: 'SS', breakpointsMetPercentage: 84, color: '#FF8C42', description: 'Excellent - Outstanding build with great discs (top 25%)' },
  { grade: 'S', breakpointsMetPercentage: 72, color: '#FFD93D', description: 'Very Good - Strong build with good discs (top 50%)' },
  { grade: 'A', breakpointsMetPercentage: 66, color: '#6BCF7F', description: 'Good - Solid build with decent discs (top 60%)' },
  { grade: 'B', breakpointsMetPercentage: 56, color: '#4D96FF', description: 'Decent - Room for improvement (top 80%)' },
  { grade: 'C', breakpointsMetPercentage: 38, color: '#A0A0A0', description: 'Below Average - Missing key stats (top 90%)' },
  { grade: 'D', breakpointsMetPercentage: 30, color: '#808080', description: 'Poor - Major gaps in stats (top 95%)' },
  { grade: 'F', breakpointsMetPercentage: 0, color: '#606060', description: 'Unoptimized - Needs complete rework' },
];

/**
 * Feedback item for build improvement suggestions
 */
export interface FeedbackItem {
  priority: 'high' | 'medium' | 'low';
  category: 'stat' | 'disc' | 'set' | 'wengine';
  message: string;
  stat?: string;
  currentValue?: number;
  targetValue?: number;
}
