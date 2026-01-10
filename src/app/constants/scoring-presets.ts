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
      Pen_Ratio: 1.2,
    },
    mainStatPreferences: {
      Drive4: ['CRIT_Rate', 'CRIT_DMG'],
      Drive5: ['Element_DMG'],
      Drive6: ['ATK%'],
    },
  },
  Anomaly: {
    name: 'Anomaly Build',
    weights: {
      Anomaly_Proficiency: 2.0,
      'ATK%': 1.5,
      ATK: 0.5,
      CRIT_Rate: 1.0,
      CRIT_DMG: 0.8,
    },
    mainStatPreferences: {
      Drive4: ['Anomaly_Proficiency', 'CRIT_Rate'],
      Drive5: ['Element_DMG', 'Pen_Ratio'],
      Drive6: ['Anomaly_Proficiency', 'ATK%'],
    },
  },
  Stun: {
    name: 'Stun Build',
    weights: {
      Impact: 2.0,
      CRIT_Rate: 1.0,
      CRIT_DMG: 0.8,
      'ATK%': 1.0,
      Energy_Regen: 1.2,
    },
    mainStatPreferences: {
      Drive4: ['CRIT_Rate', 'Impact'],
      Drive5: ['Element_DMG'],
      Drive6: ['Impact', 'Energy_Regen'],
    },
  },
  Support: {
    name: 'Support Build',
    weights: {
      Energy_Regen: 2.0,
      'HP%': 1.2,
      'DEF%': 1.0,
      'ATK%': 1.0,
    },
    mainStatPreferences: {
      Drive4: ['CRIT_Rate', 'HP%'],
      Drive5: ['Pen_Ratio'],
      Drive6: ['Energy_Regen'],
    },
  },
  Defense: {
    name: 'Defense Build',
    weights: {
      'DEF%': 2.0,
      'HP%': 1.5,
      DEF: 0.5,
      HP: 0.5,
      Energy_Regen: 1.0,
    },
    mainStatPreferences: {
      Drive4: ['DEF%', 'HP%'],
      Drive5: ['Pen_Ratio'],
      Drive6: ['Energy_Regen', 'DEF%'],
    },
  },
  Rupture: {
    name: 'Rupture Build',
    weights: {
      'HP%': 2.0
    },
    mainStatPreferences: {

    },
  }
};
