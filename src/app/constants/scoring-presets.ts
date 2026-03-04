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
  }
};
