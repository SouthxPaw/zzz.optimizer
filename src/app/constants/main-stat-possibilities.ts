import { DiscSlot, MainStatType } from "../models/agent.model";

// constants/main-stat-possibilities.ts
export const MAIN_STAT_BY_SLOT: Record<DiscSlot, MainStatType[]> = {
  Drive1: ['HP'],
  Drive2: ['ATK'],
  Drive3: ['DEF'],
  Drive4: ['HP%', 'ATK%', 'DEF%', 'CRIT_Rate', 'CRIT_DMG', 'Anomaly_Proficiency'],
  Drive5: ['HP%', 'ATK%', 'DEF%', 'Element_DMG', 'Pen_Ratio'],
  Drive6: ['HP%', 'ATK%', 'DEF%', 'Anomaly_Mastery', 'Impact', 'Energy_Regen'],
};
