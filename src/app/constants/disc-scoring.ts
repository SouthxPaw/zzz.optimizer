// Constants for disc scoring system
// Based on common gacha game "crit value" methodology

/**
 * Substat point values - how many "points" each 1% or 1 flat stat is worth
 * Higher values = more valuable stats
 */
export const SUBSTAT_WEIGHTS: { [key: string]: number } = {
  // Premium stats (most valuable) - base values, multiplied by agent weights
  // Calibrated for ZZZ where substats can reach ~20% through upgrades
  'CRIT_Rate': 0.5,      // 1% CRIT Rate = 0.5 points (×2 for crit agents = 1.0)
  'CRIT_DMG': 0.25,      // 1% CRIT DMG = 0.25 points (×2 for crit agents = 0.5)
  'PEN_Ratio': 0.5,      // 1% PEN Ratio = 0.5 points (very rare and valuable)

  // Primary DPS stats
  'ATK%': 0.35,          // 1% ATK = 0.35 points (×1.5-2 for most DPS = 0.525-0.7)

  // Secondary stats
  'HP%': 0.2,            // 1% HP = 0.2 points
  'DEF%': 0.2,           // 1% DEF = 0.2 points
  'Energy_Regen': 0.15,  // 1% Energy Regen = 0.15 points

  // "Good" flat stats (no % alternative exists, so these are legitimate substats)
  // Weighted to be valuable when agent needs them, scaled for ZZZ's roll ranges
  'Anomaly_Proficiency': 0.09,  // 1 Anomaly Proficiency = 0.09 points (×2 for anomaly = 0.18)
  'Anomaly_Mastery': 0.09,      // 1 Anomaly Mastery = 0.09 points (×1.5-2 = 0.135-0.18)
  'PEN': 0.06,                  // 1 flat PEN = 0.06 points (rolls very high, 112 × 0.06 = ~6.7)
  'Impact': 0.09,               // 1 Impact = 0.09 points (×1.5-2 = 0.135-0.18)

  // "Bad" flat stats (much less valuable because % versions exist and are much better)
  'ATK': 0.015,          // 1 flat ATK = 0.015 points (bad because ATK% exists)
  'HP': 0.006,           // 1 flat HP = 0.006 points (bad because HP% exists)
  'DEF': 0.009,          // 1 flat DEF = 0.009 points (bad because DEF% exists)
};

/**
 * Stats that count as "bad" flat stats for penalty calculation
 * These stats reduce disc value when multiple appear together
 * Excludes Anomaly_Proficiency and PEN because they only roll flat
 */
export const BAD_FLAT_STATS = ['HP', 'ATK', 'DEF'];

/**
 * Penalty applied for each additional "bad" flat stat beyond the first
 * Example: 1 bad flat = 0 penalty, 2 bad flats = -2 points, 3 bad flats = -4 points
 */
export const FLAT_STAT_PENALTY_PER_ADDITIONAL = 2;

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
  BREAKPOINT: 0.30,      // 30% - Meeting stat breakpoints
  DISC_QUALITY: 0.50,    // 50% - Average disc rating quality (MOST IMPORTANT)
  STAT_EFFICIENCY: 0.10, // 10% - Stat allocation efficiency
  SET_BONUS: 0.10,       // 10% - Set effect alignment
};

/**
 * Role-specific weight multipliers
 * Adjusts substat values based on what the agent role values most
 */
export const ROLE_WEIGHT_MULTIPLIERS: { [role: string]: { [stat: string]: number } } = {
  'Attack': {
    'CRIT_Rate': 1.0,
    'CRIT_DMG': 1.0,
    'ATK%': 1.0,
    'PEN_Ratio': 1.0,
    'HP%': 0.5,
    'DEF%': 0.5,
  },
  'Stun': {
    'Impact': 2.0,         // Stun agents value Impact more
    'CRIT_Rate': 0.8,
    'CRIT_DMG': 0.8,
    'ATK%': 0.9,
    'DEF%': 0.7,
  },
  'Anomaly': {
    'Anomaly_Proficiency': 2.0,  // Anomaly agents value this highly
    'Anomaly_Mastery': 2.0,
    'ATK%': 1.0,
    'CRIT_Rate': 0.6,
    'CRIT_DMG': 0.6,
  },
  'Support': {
    'Energy_Regen': 1.5,
    'HP%': 1.2,
    'DEF%': 1.2,
    'ATK%': 0.7,
    'CRIT_Rate': 0.5,
    'CRIT_DMG': 0.5,
  },
  'Defense': {
    'HP%': 1.5,
    'DEF%': 1.5,
    'Impact': 1.2,
    'CRIT_Rate': 0.6,
    'CRIT_DMG': 0.6,
    'ATK%': 0.7,
  },
  'Rupture': {
    'Impact': 1.5,
    'CRIT_Rate': 1.0,
    'CRIT_DMG': 1.0,
    'ATK%': 1.0,
  }
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
 */
export interface DiscRating {
  grade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  minPoints: number;
  color: string;
  description: string;
}

export const DISC_RATING_THRESHOLDS: DiscRating[] = [
  { grade: 'SSS', minPoints: 50, color: '#FF6B9D', description: 'Perfect disc - max rolls on premium stats' },
  { grade: 'SS', minPoints: 40, color: '#FF8C42', description: 'Excellent disc - high rolls on good stats' },
  { grade: 'S', minPoints: 30, color: '#FFD93D', description: 'Very good disc - solid rolls' },
  { grade: 'A', minPoints: 22, color: '#6BCF7F', description: 'Good disc - usable rolls' },
  { grade: 'B', minPoints: 15, color: '#4D96FF', description: 'Decent disc - acceptable rolls' },
  { grade: 'C', minPoints: 10, color: '#A0A0A0', description: 'Below average disc' },
  { grade: 'D', minPoints: 5, color: '#808080', description: 'Poor disc' },
  { grade: 'F', minPoints: 0, color: '#606060', description: 'Trash disc - fodder' },
];

/**
 * Build rating thresholds based on stat breakpoints
 */
export interface BuildRating {
  grade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  breakpointsMetPercentage: number;  // Percentage of optimal breakpoints met
  color: string;
  description: string;
}

export const BUILD_RATING_THRESHOLDS: BuildRating[] = [
  { grade: 'SSS', breakpointsMetPercentage: 90, color: '#FF6B9D', description: 'Perfect build - exceeds all breakpoints' },
  { grade: 'SS', breakpointsMetPercentage: 80, color: '#FF8C42', description: 'Excellent build - meets most breakpoints' },
  { grade: 'S', breakpointsMetPercentage: 70, color: '#FFD93D', description: 'Very good build - meets key breakpoints' },
  { grade: 'A', breakpointsMetPercentage: 60, color: '#6BCF7F', description: 'Good build - solid performance' },
  { grade: 'B', breakpointsMetPercentage: 45, color: '#4D96FF', description: 'Decent build - room for improvement' },
  { grade: 'C', breakpointsMetPercentage: 30, color: '#A0A0A0', description: 'Below average build' },
  { grade: 'D', breakpointsMetPercentage: 15, color: '#808080', description: 'Poor build - needs work' },
  { grade: 'F', breakpointsMetPercentage: 0, color: '#606060', description: 'Unoptimized build' },
];
