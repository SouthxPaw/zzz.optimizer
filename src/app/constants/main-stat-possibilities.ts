import { DiscSlot } from "../models/agent.model";
import { MainStatType } from "../models/disc.model";

// constants/main-stat-possibilities.ts
export const MAIN_STAT_BY_SLOT: Record<DiscSlot, MainStatType[]> = {
  Drive1: ['HP'],
  Drive2: ['ATK'],
  Drive3: ['DEF'],
  Drive4: ['HP%', 'ATK%', 'DEF%', 'CRIT_Rate', 'CRIT_DMG', 'Anomaly_Proficiency'],
  Drive5: ['HP%', 'ATK%', 'DEF%', 'Element_DMG', 'PEN_Ratio'],
  Drive6: ['HP%', 'ATK%', 'DEF%', 'Anomaly_Mastery', 'Impact', 'Energy_Regen'],
};

// Max main stat values at Level 15 S-Rank for Slots 4-6
export const DISC_MAIN_STAT_MAX: Record<'Drive4' | 'Drive5' | 'Drive6', Record<string, number>> = {
  Drive4: {
    'HP%': 30,
    'ATK%': 30,
    'DEF%': 48,
    'CRIT_Rate': 24,
    'CRIT_DMG': 48,
    'Anomaly_Proficiency': 92
  },
  Drive5: {
    'HP%': 30,
    'ATK%': 30,
    'DEF%': 48,
    'PEN_Ratio': 24,
    'Element_DMG': 30
  },
  Drive6: {
    'HP%': 30,
    'ATK%': 30,
    'DEF%': 48,
    'Anomaly_Mastery': 30,
    'Energy_Regen': 60,
    'Impact': 18
  }
};
