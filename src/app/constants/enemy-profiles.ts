/**
 * Enemy Profiles for Damage Calculations
 *
 * Community-informed values from player testing and datamining.
 * These are used to calculate damage against different enemy types.
 */

export interface EnemyProfile {
  name: string;
  def: number;
  res: number;
  hp: number;
  dazeGauge: number;  // Relative gauge length (0.5 = fills 2x faster, 1.0 = baseline)
}

/**
 * Standard enemy profiles for scoring
 *
 * DEF values: Community reverse-engineered from damage tests
 * RES values: Categorical estimates (weakness -20%, neutral 0%, resist +20%)
 * HP values: From community leaks
 * Daze Gauge: Relative to boss baseline
 */
export const ENEMY_PROFILES: EnemyProfile[] = [
  {
    name: 'Trash Mob',
    def: 700,
    res: 0.10,
    hp: 700000,
    dazeGauge: 0.50
  },
  {
    name: 'Elite',
    def: 760,
    res: 0.15,
    hp: 900000,
    dazeGauge: 0.75
  },
  {
    name: 'Boss',
    def: 955,
    res: 0.20,
    hp: 8000000,
    dazeGauge: 1.00
  },
  {
    name: 'Miasma Boss',
    def: 955,
    res: 0.20,
    hp: 12000000,
    dazeGauge: 1.00
  }
];

/**
 * Default enemy profile for scoring (Elite)
 */
export const DEFAULT_ENEMY_PROFILE = ENEMY_PROFILES[1];

/**
 * RES modifiers based on elemental weakness/resistance
 */
export const RES_MODIFIERS = {
  WEAKNESS: -0.20,    // -20% RES (takes 20% more damage)
  NEUTRAL: 0.00,      // 0% RES (baseline)
  RESISTANCE: 0.20    // +20% RES (takes 20% less damage)
};

/**
 * Get enemy profile by name
 */
export function getEnemyProfile(name: string): EnemyProfile | undefined {
  return ENEMY_PROFILES.find(p => p.name === name);
}

/**
 * Calculate effective RES with weakness/resistance modifier
 *
 * @param baseRes - Enemy's base RES (e.g., 0.20 for 20%)
 * @param modifier - Weakness/resistance modifier from RES_MODIFIERS
 * @returns Effective RES
 */
export function getEffectiveRes(baseRes: number, modifier: number = 0): number {
  return baseRes + modifier;
}
