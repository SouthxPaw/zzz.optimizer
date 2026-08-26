import { Specialty } from "../models/agent.model";
import { ScoringAlgorithm } from "../models/scoring.model";

// constants/scoring-presets.ts
export const SCORING_PRESETS: Record<Specialty, ScoringAlgorithm> = {
  Attack: {
    name: 'Attack Build',
    weights: {
      CRIT_Rate: 2.0,
      CRIT_DMG: 1.0,
      'ATK%': 1.5,
      ATK: 0.5,
      PEN: 1.2,
    },
    mainStatPreferences: {
      Drive4: ['CRIT_Rate', 'CRIT_DMG', 'ATK%'],
      Drive5: ['Element_DMG', 'ATK%'],
      Drive6: ['ATK%'],
    },
  },
  Anomaly: {
    name: 'Anomaly Build',
    weights: {
      Anomaly_Proficiency: 2.0,
      'ATK%': 1.5,
      ATK: 0.5,
      PEN: 0.5,
      CRIT_Rate: 0.0,
      CRIT_DMG: 0.0,
    },
    mainStatPreferences: {
      Drive4: ['Anomaly_Proficiency'],
      Drive5: ['Element_DMG', 'PEN_Ratio', 'ATK%'],
      Drive6: ['Anomaly_Mastery', 'ATK%'],
    },
  },
  Stun: {
    name: 'Stun Build',
    weights: {
      // Note: Impact and Energy_Regen removed - they are main stats only, not substats
      CRIT_Rate: 1.0,
      CRIT_DMG: 1.0,
      'ATK%': 1.0,
      'HP%': 0.5,
    },
    mainStatPreferences: {
      Drive4: ['CRIT_Rate', 'CRIT_DMG'],
      Drive5: ['Element_DMG', 'ATK%'],
      Drive6: ['Impact', 'Energy_Regen'], // These are valid as main stats
    },
  },
  Support: {
    name: 'Support Build',
    weights: {
      // Note: Energy_Regen removed - it is a main stat only, not a substat
      'PEN': 1.0,
      'HP%': 0.5,
      'DEF%': 0.5,
      'ATK%': 2.0,
    },
    mainStatPreferences: {
      Drive4: ['CRIT_Rate', 'CRIT_DMG', 'ATK%', 'Anomaly_Proficiency'],
      Drive5: ['ATK%', 'Element_DMG'],
      Drive6: ['Energy_Regen', 'ATK%'], // Energy_Regen valid as main stat
    },
  },
  Defense: {
    name: 'Defense Build',
    weights: {
      'DEF%': 2.0,
      'HP%': 1.5,
      DEF: 0.5,
      HP: 0.5,
      // Note: Energy_Regen removed - it is a main stat only, not a substat
    },
    mainStatPreferences: {
      Drive4: ['CRIT_Rate', 'CRIT_DMG', 'Anomaly_Proficiency', 'ATK%'],
      Drive5: ['ATK%', 'Element_DMG'],
      Drive6: ['ATK%', 'Impact', 'Energy_Regen'],
    },
  },
  Rupture: {
    name: 'Rupture Build',
    weights: {
      'HP%': 2.0,
      'CRIT_Rate': 1.0,
      'CRIT_DMG': 1.0,
      'HP': 0.5
    },
    mainStatPreferences: {
      Drive4: ['CRIT_Rate', 'CRIT_DMG'],
      Drive5: ['Element_DMG', 'HP%'],
      Drive6: ['HP%']
    },
  },
  // PROVISIONAL: Armorer is a new specialty introduced with Claret.
  //
  // Armorer agents deal Sharp DMG, which uses DEF as the damage multiplier instead
  // of ATK - so ATK is a dead stat and is weighted 0. Sharp DMG also ignores CRIT DMG
  // Bonus, using a fixed Laceration multiplier on CRIT instead. CRIT DMG therefore
  // only matters as a feeder for Claret's core passive (0.35% CRIT Rate per 1% initial
  // CRIT DMG), which is why it sits below DEF% rather than at the top.
  //
  // Priority follows published guidance: CRIT Rate > DEF% > CRIT DMG > PEN > DEF.
  // Revisit once Armorer kits beyond Claret are known.
  Armorer: {
    name: 'Armorer Build',
    weights: {
      CRIT_Rate: 2.0,
      'DEF%': 1.5,
      CRIT_DMG: 1.0,
      PEN: 0.7,
      DEF: 0.5,
      'ATK%': 0.0,
      ATK: 0.0,
    },
    mainStatPreferences: {
      Drive4: ['CRIT_Rate', 'CRIT_DMG'],
      Drive5: ['PEN_Ratio', 'Element_DMG', 'DEF%'],
      Drive6: ['DEF%'],
    },
  }
};
