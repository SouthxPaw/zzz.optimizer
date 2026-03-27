import { Disc, MainStatType, SubStatType } from '../models/disc.model';

/**
 * Utility functions for validating disc configurations
 * Used to check both new discs (during creation) and existing discs (already in inventory)
 */

/**
 * Get validation errors for a disc
 * Returns array of error messages (empty array = valid disc)
 */
export function getDiscValidationErrors(disc: Disc): string[] {
  const errors: string[] = [];

  // Check for duplicate substats
  const substatTypes = disc.subStats.map(s => s.type);
  const seenTypes = new Set<SubStatType>();
  const duplicates = new Set<SubStatType>();

  for (const type of substatTypes) {
    if (seenTypes.has(type)) {
      duplicates.add(type);
    }
    seenTypes.add(type);
  }

  if (duplicates.size > 0) {
    const duplicateList = Array.from(duplicates).join(', ');
    errors.push(`Duplicate substat${duplicates.size > 1 ? 's' : ''}: ${duplicateList}`);
  }

  // Check for main stat = substat conflict
  const mainStatType = disc.mainStat.type;
  const conflictingSubstats = disc.subStats.filter(sub => sub.type === mainStatType);

  if (conflictingSubstats.length > 0) {
    errors.push(`${formatStatType(mainStatType)} cannot be both main stat and substat`);
  }

  return errors;
}

/**
 * Check if a disc has any validation errors
 */
export function hasValidationErrors(disc: Disc): boolean {
  return getDiscValidationErrors(disc).length > 0;
}

/**
 * Format a stat type for display (e.g., "CRIT_Rate" → "CRIT Rate")
 */
function formatStatType(statType: MainStatType | SubStatType): string {
  const typeMap: { [key: string]: string } = {
    'HP': 'HP',
    'HP%': 'HP%',
    'ATK': 'ATK',
    'ATK%': 'ATK%',
    'DEF': 'DEF',
    'DEF%': 'DEF%',
    'CRIT_Rate': 'CRIT Rate',
    'CRIT_DMG': 'CRIT DMG',
    'Anomaly_Proficiency': 'Anomaly Proficiency',
    'Anomaly_Mastery': 'Anomaly Mastery',
    'PEN': 'PEN',
    'PEN_Ratio': 'PEN Ratio',
    'Element_DMG': 'Element DMG',
    'Impact': 'Impact',
    'Energy_Regen': 'Energy Regen'
  };

  return typeMap[statType] || statType;
}
