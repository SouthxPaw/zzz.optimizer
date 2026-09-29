import { Specialty } from "./agent.model";

// Refinement-based stat bonuses from Effect.Properties
export interface RefinementProperty {
  name: string; // e.g., "Energy Regen", "ATK", "HP"
  type: 'ATK%' | 'HP%' | 'DEF%' | 'CRIT_Rate' | 'CRIT_DMG' | 'PEN_Ratio' | 'Energy_Regen' | 'Impact' | 'Anomaly_Proficiency' | 'Anomaly_Mastery' | 'Sheer_Force' | 'Sheer Force';
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
  /**
   * Value of the W-Engine's BaseProperty. Named `baseAtk` for historical reasons -
   * for Armorer W-Engines this is Base DEF, not Base ATK. Check `baseStatType`
   * before adding it to a stat pool.
   */
  baseAtk: number;
  /**
   * Which stat the BaseProperty feeds. Armorer W-Engines (e.g. Crimson Thirst)
   * have Base DEF; everything else has Base ATK. Absent means ATK.
   */
  baseStatType?: 'ATK' | 'DEF';
  subStat: {
    type: 'ATK%' | 'HP%' | 'DEF%' | 'CRIT_Rate' | 'CRIT_DMG' | 'PEN_Ratio' | 'Energy_Regen' | 'Impact' | 'Anomaly_Proficiency' | 'Anomaly_Mastery' | 'Sheer_Force' | 'Sheer Force';
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
