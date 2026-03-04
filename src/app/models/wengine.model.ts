import { Specialty } from "./agent.model";

// Refinement-based stat bonuses from Effect.Properties
export interface RefinementProperty {
  name: string; // e.g., "Energy Regen", "ATK", "HP"
  type: 'ATK%' | 'HP%' | 'DEF%' | 'CRIT_Rate' | 'CRIT_DMG' | 'PEN_Ratio' | 'Energy_Regen' | 'Impact' | 'Anomaly_Proficiency' | 'Anomaly_Mastery';
  values: {
    W1: number;
    W2: number;
    W3: number;
    W4: number;
    W5: number;
  };
}

// models/wengine.model.ts
export interface WEngine {
  id: string;
  name: string;
  rarity: 'S' | 'A' | 'B';
  specialty: Specialty;
  baseAtk: number;
  subStat: {
    type: 'ATK%' | 'HP%' | 'DEF%' | 'CRIT_Rate' | 'CRIT_DMG' | 'PEN_Ratio' | 'Energy_Regen' | 'Impact' | 'Anomaly_Proficiency' | 'Anomaly_Mastery';
    value: number;
  };
  effect: {
    name: string;
    description: string;
    properties?: RefinementProperty[]; // Stat bonuses that scale with refinement
  };
  signature?: string;
  icon?: string;
}
