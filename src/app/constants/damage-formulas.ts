/**
 * ZZZ Damage Calculation Formulas
 *
 * Source: https://github-wiki-see.page/m/Night-Sky-Studio/interknot-calculator/wiki/ZZZ-Formulas
 * Verified: 2026-01-13
 *
 * These formulas are used for damage estimation in the optimizer.
 * They provide approximate damage output to help compare builds.
 */

/**
 * Level coefficient for DEF scaling
 * Formula: Level * 10 + 100
 *
 * Common values:
 * - Level 60: 700
 * - Level 70: 800
 * - Level 80: 900
 * - Level 90: 1000
 */
export const LEVEL_COEFFICIENT = {
  60: 700,
  70: 800,
  80: 900,
  90: 1000,
};

/**
 * Default enemy stats for damage calculations
 * Using a standardized enemy similar to Fribbels' approach
 */
export const STANDARD_ENEMY = {
  level: 90,
  baseDEF: 1000,
  defModifier: 1.0,        // No DEF buffs/debuffs
  attributeRES: 0.10,      // 10% resistance (typical)
  allTypeRES: 0.0,         // No universal resistance
};

/**
 * Status effect base damage multipliers (as % of ATK)
 */
export const STATUS_EFFECT_MULTIPLIERS = {
  BURN: 0.50,              // 50% ATK per tick
  SHOCK: 1.25,             // 125% ATK per proc
  SHATTER: 5.00,           // 500% ATK (Ice/Frost)
  ASSAULT: 7.13,           // 713% ATK (Physical)
  CORRUPTION: 0.625,       // 62.5% ATK per tick (Ether)
};

/**
 * Calculate the base damage before modifiers
 *
 * @param skillMultiplier - Motion value from skill (e.g., 2.5 for 250% ATK)
 * @param scalingStat - Primary scaling stat (typically ATK)
 * @param flatBonus - Flat damage bonuses
 * @returns Base damage value
 */
export function calculateBaseDamage(
  skillMultiplier: number,
  scalingStat: number,
  flatBonus: number = 0
): number {
  return (skillMultiplier * scalingStat) + flatBonus;
}

/**
 * Calculate average CRIT modifier
 *
 * Formula: 1 + (CRIT Rate × CRIT DMG)
 *
 * @param critRate - CRIT Rate as decimal (0.80 = 80%)
 * @param critDMG - CRIT DMG as decimal (1.50 = 150%)
 * @returns Average CRIT multiplier
 */
export function calculateCRITModifier(critRate: number, critDMG: number): number {
  return 1 + (critRate * critDMG);
}

/**
 * Calculate DEF modifier (damage reduction from enemy DEF)
 *
 * Formula: Level Coefficient / (Level Coefficient + Effective DEF)
 *
 * @param playerLevel - Character level (60, 70, 80, 90)
 * @param enemyDEF - Enemy's effective DEF after PEN/reduction
 * @returns DEF modifier (0.0 - 1.0)
 */
export function calculateDEFModifier(playerLevel: number, enemyDEF: number): number {
  const levelCoeff = LEVEL_COEFFICIENT[playerLevel as keyof typeof LEVEL_COEFFICIENT] || 1000;
  return levelCoeff / (levelCoeff + Math.max(0, enemyDEF));
}

/**
 * Calculate effective enemy DEF after PEN and reductions
 *
 * Formula: Target DEF × (1 - PEN Ratio%) - Flat PEN
 * (Cannot go below 0)
 *
 * @param baseDEF - Enemy's base DEF
 * @param penRatio - PEN Ratio as decimal (0.30 = 30%)
 * @param flatPEN - Flat PEN value
 * @returns Effective DEF value
 */
export function calculateEffectiveDEF(
  baseDEF: number,
  penRatio: number,
  flatPEN: number
): number {
  const effectiveDEF = (baseDEF * (1 - penRatio)) - flatPEN;
  return Math.max(0, effectiveDEF);
}

/**
 * Calculate RES modifier (resistance reduction)
 *
 * Formula: 1 - (Attribute RES% + All Type RES% - RES Reduction% - RES PEN%)
 *
 * @param attributeRES - Enemy's elemental resistance (0.10 = 10%)
 * @param allTypeRES - Universal resistance (usually 0)
 * @param resReduction - RES reduction from debuffs (0.20 = 20%)
 * @param resPEN - RES penetration from character (0.15 = 15%)
 * @returns RES modifier
 */
export function calculateRESModifier(
  attributeRES: number,
  allTypeRES: number,
  resReduction: number,
  resPEN: number
): number {
  return 1 - (attributeRES + allTypeRES - resReduction - resPEN);
}

/**
 * Calculate damage% modifier from all sources
 *
 * Formula: 1 + Σ(DMG%)
 *
 * @param dmgBonuses - Array of damage% bonuses as decimals
 * @returns Total damage% modifier
 */
export function calculateDMGModifier(dmgBonuses: number[]): number {
  const totalBonus = dmgBonuses.reduce((sum, bonus) => sum + bonus, 0);
  return 1 + totalBonus;
}

/**
 * Calculate stun bonus modifier
 *
 * @param stunBonus - Stun bonus as decimal (0.20 = 20%)
 * @returns Stun modifier
 */
export function calculateStunModifier(stunBonus: number): number {
  return 1 + stunBonus;
}

/**
 * Calculate final damage output
 *
 * Formula: Base DMG × DMG% Mod × CRIT Mod × RES Mod × DEF Mod × Stun Mod × Dmg Taken
 *
 * @param baseDMG - Base damage before modifiers
 * @param critMod - CRIT modifier
 * @param defMod - DEF modifier
 * @param resMod - RES modifier
 * @param dmgMod - DMG% modifier
 * @param stunMod - Stun modifier (default 1.0)
 * @param dmgTaken - Damage taken multiplier (default 1.0)
 * @returns Final damage value
 */
export function calculateFinalDamage(
  baseDMG: number,
  critMod: number,
  defMod: number,
  resMod: number,
  dmgMod: number,
  stunMod: number = 1.0,
  dmgTaken: number = 1.0
): number {
  return baseDMG * dmgMod * critMod * resMod * defMod * stunMod * dmgTaken;
}

/**
 * Simplified damage estimation for optimizer scoring
 * Uses standardized enemy and typical skill multiplier
 *
 * @param stats - Character stats object
 * @param skillMultiplier - Skill motion value (default 2.5 = 250% ATK)
 * @param dmgBonuses - Array of damage% bonuses (e.g., [0.30, 0.15] for 30% + 15%)
 * @returns Estimated damage per hit
 */
export function estimateDamage(stats: {
  ATK: number;
  critRate: number;
  critDMG: number;
  penRatio?: number;
  flatPEN?: number;
  level?: number;
}, skillMultiplier: number = 2.5, dmgBonuses: number[] = []): number {
  // Base damage
  const baseDMG = calculateBaseDamage(skillMultiplier, stats.ATK);

  // CRIT modifier
  const critMod = calculateCRITModifier(stats.critRate, stats.critDMG);

  // DEF modifier
  const playerLevel = stats.level || 60;
  const effectiveDEF = calculateEffectiveDEF(
    STANDARD_ENEMY.baseDEF,
    stats.penRatio || 0,
    stats.flatPEN || 0
  );
  const defMod = calculateDEFModifier(playerLevel, effectiveDEF);

  // RES modifier (assuming no RES reduction/PEN for simplicity)
  const resMod = calculateRESModifier(
    STANDARD_ENEMY.attributeRES,
    STANDARD_ENEMY.allTypeRES,
    0, // No RES reduction
    0  // No RES PEN
  );

  // DMG% modifier
  const dmgMod = calculateDMGModifier(dmgBonuses);

  // Calculate final damage
  return calculateFinalDamage(baseDMG, critMod, defMod, resMod, dmgMod);
}

/**
 * Calculate status effect damage (Burn, Shock, etc.)
 *
 * @param statusType - Type of status effect
 * @param ATK - Character's ATK stat
 * @param dmgBonuses - Applicable damage% bonuses
 * @returns Status effect damage per proc/tick
 */
export function calculateStatusDamage(
  statusType: keyof typeof STATUS_EFFECT_MULTIPLIERS,
  ATK: number,
  dmgBonuses: number[] = []
): number {
  const baseDMG = ATK * STATUS_EFFECT_MULTIPLIERS[statusType];
  const dmgMod = calculateDMGModifier(dmgBonuses);

  // Status effects bypass DEF but are affected by RES
  const resMod = calculateRESModifier(
    STANDARD_ENEMY.attributeRES,
    STANDARD_ENEMY.allTypeRES,
    0,
    0
  );

  return baseDMG * dmgMod * resMod;
}
