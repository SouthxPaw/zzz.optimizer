// Constants for disc scoring system
// Based on fribbels HSR optimizer approach using priority stats

/**
 * Breakpoint penalty configuration
 * Applied when a stat fails to meet its minimum or optimal threshold
 */
export const BREAKPOINT_PENALTIES = {
  // Penalty for missing minimum breakpoint (0-100%)
  MISSING_MIN: 0.30,  // 30% penalty if below minimum
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
  grade: 'VH' | 'LGD' | 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  minPoints: number;
  color: string;
  description: string;
}

export const DISC_RATING_THRESHOLDS: DiscRating[] = [
  { grade: 'VH', minPoints: 135, color: 'linear-gradient(135deg, #E0BBE4 0%, #957DAD 25%, #D291BC 50%, #FEC8D8 75%, #FFDFD3 100%)', description: 'Void Hunter - Absolute perfection (GOD tier)' },
  { grade: 'LGD', minPoints: 118, color: 'linear-gradient(135deg, #FFD700 0%, #E5E4E2 33%, #B9F2FF 66%, #FFD700 100%)', description: 'Legendary - Near-perfect disc (ZERO tier)' },
  { grade: 'SSS', minPoints: 100, color: '#FF6B9D', description: 'Perfect - Outstanding disc (SSS tier)' },
  { grade: 'SS', minPoints: 91, color: '#FF8C42', description: 'Excellent - Great disc (SS tier)' },
  { grade: 'S', minPoints: 82, color: '#FFD93D', description: 'Very Good - Above average disc (S tier)' },
  { grade: 'A', minPoints: 72, color: '#6BCF7F', description: 'Good - Decent disc (A tier)' },
  { grade: 'B', minPoints: 62, color: '#4D96FF', description: 'Average - Usable disc (B tier)' },
  { grade: 'C', minPoints: 48, color: '#A0A0A0', description: 'Below Average - Needs upgrading (C tier)' },
  { grade: 'D', minPoints: 40, color: '#808080', description: 'Poor - Consider replacing (D tier)' },
  { grade: 'F', minPoints: 0, color: '#606060', description: 'Unusable - Immediate fodder (F tier)' },
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
  { grade: 'VOID HUNTER', breakpointsMetPercentage: 97, color: 'linear-gradient(135deg, #E0BBE4 0%, #957DAD 25%, #D291BC 50%, #FEC8D8 75%, #FFDFD3 100%)', description: 'Void Hunter - Perfect build with absolute best-in-slot discs' },
  { grade: 'LEGENDARY', breakpointsMetPercentage: 92, color: 'linear-gradient(135deg, #FFD700 0%, #E5E4E2 33%, #B9F2FF 66%, #FFD700 100%)', description: 'Legendary - Nearly perfect build with exceptional discs' },
  { grade: 'SSS', breakpointsMetPercentage: 82, color: '#FF6B9D', description: 'Perfect - God-tier build with near-perfect discs' },
  { grade: 'SS', breakpointsMetPercentage: 75, color: '#FF8C42', description: 'Excellent - Outstanding build with great discs' },
  { grade: 'S', breakpointsMetPercentage: 62, color: '#FFD93D', description: 'Very Good - Strong build with pretty good discs' },
  { grade: 'A', breakpointsMetPercentage: 52, color: '#6BCF7F', description: 'Good - Solid build with decent discs' },
  { grade: 'B', breakpointsMetPercentage: 40, color: '#4D96FF', description: 'Decent - Room for improvement' },
  { grade: 'C', breakpointsMetPercentage: 32, color: '#A0A0A0', description: 'Below Average - Missing key stats' },
  { grade: 'D', breakpointsMetPercentage: 20, color: '#808080', description: 'Poor - Major gaps in stats' },
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
