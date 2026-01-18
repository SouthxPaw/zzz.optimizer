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
 * Weighted importance of each enemy type for scoring
 * Bosses weighted higher since optimization matters most for endgame content
 */
export const ENEMY_WEIGHTS = {
  'Trash Mob': 0.10,      // 10% - Easy content, less important
  'Elite': 0.25,          // 25% - Moderate content
  'Boss': 0.40,           // 40% - Most important (Shiyu Defense, etc.)
  'Miasma Boss': 0.25     // 25% - Endgame content
};
