import { Specialty } from "./agent.model";

// models/wengine.model.ts
export interface WEngine {
  id: string;
  name: string;
  rarity: 'S' | 'A' | 'B';
  specialty: Specialty;
  baseAtk: number;
  subStat: {
    type: 'ATK%' | 'HP%' | 'DEF%' | 'CRIT_Rate' | 'CRIT_DMG' | 'PEN_Ratio' | 'Energy_Regen' | 'Impact' | 'Anomaly_Proficiency';
    value: number;
  };
  effect: {
    name: string;
    description: string;
    maxRefinement?: string;
  };
  signature?: string;
}
