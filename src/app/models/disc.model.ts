import { BaseStats, DiscSlot } from "./agent.model";

// models/disc.model.ts
export type MainStatType =
  | 'HP' | 'HP%' | 'ATK' | 'ATK%' | 'DEF' | 'DEF%'
  | 'CRIT_Rate' | 'CRIT_DMG' | 'Anomaly_Proficiency' | 'Anomaly_Mastery'
  | 'Pen_Ratio' | 'Element_DMG' | 'Impact' | 'Energy_Regen';

export type SubStatType =
  | 'HP' | 'HP%' | 'ATK' | 'ATK%' | 'DEF' | 'DEF%'
  | 'CRIT_Rate' | 'CRIT_DMG' | 'Anomaly_Proficiency' | 'Anomaly_Mastery'
  | 'PEN' | 'Impact' | 'Energy_Regen';

export interface SubStat {
  type: SubStatType;
  value: number;
  rolls?: number;
}

export interface Disc {
  uid: string;
  slot: DiscSlot;
  set: string;
  rarity: 'B' | 'A' | 'S';
  level: number;
  mainStat: {
    type: MainStatType;
    value: number;
  };
  subStats: SubStat[];
  equippedBy?: string; // agent id
  lock: boolean;
}

// models/disc-set.model.ts
export interface DiscSet {
  id: string;
  name: string;
  bonuses: {
    pieces: 2 | 4;
    description: string;
    stats?: Partial<BaseStats>;
  }[];
}
