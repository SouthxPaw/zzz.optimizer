// models/agent.model.ts
export type Element = 'Physical' | 'Fire' | 'Ice' | 'Electric' | 'Ether';
export type Specialty = 'Attack' | 'Stun' | 'Support' | 'Defense' | 'Anomaly' | 'Rupture';
export type DiscSlot = 'Drive1' | 'Drive2' | 'Drive3' | 'Drive4' | 'Drive5' | 'Drive6';

export interface BaseStats {
  hp: number;
  hppercent:number;
  atk: number;
  atkpercent: number;
  def: number;
  defpercent: number;
  impact: number;
  anomalyMastery: number;
  critRate: number;
  critDmg: number;
  anomalyProficiency: number;
  penRatio: number;
  energyRegen: number;
}

export interface Agent {
  id: string;
  name: string;
  rarity: 'A' | 'S';
  element: Element;
  specialty: Specialty;
  lvl60Stats: BaseStats;
  mindscapeEffects?: MindscapeEffect[];
  coreSkill?: string;
}

export interface MindscapeEffect {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  name: string;
  description: string;
}

// models/wengine.model.ts
export interface WEngine {
  id: string;
  name: string;
  rarity: 'B' | 'A' | 'S';
  specialty: Specialty;
  baseAtk: number;
  subStat: {
    type: keyof BaseStats;
    value: number;
  };
  passive: {
    name: string;
    description: string;
  };
}

// models/disc.model.ts
export type MainStatType =
  | 'HP' | 'HP%' | 'ATK' | 'ATK%' | 'DEF' | 'DEF%'
  | 'CRIT_Rate' | 'CRIT_DMG' | 'Anomaly_Proficiency' | 'Anomaly_Mastery'
  | 'Pen_Ratio' | 'Element_DMG' | 'Impact' | 'Energy_Regen';

export type SubStatType = Exclude<MainStatType,
  'Element_DMG'>;

export interface SubStat {
  type: SubStatType;
  value: number;
  rolls?: number;
}

export interface Disc {
  uid: string;
  slot: DiscSlot;
  set: string;
  rarity: 'B' | 'A' |'S';
  level: number;
  mainStat: {
    type: MainStatType;
    value: number;
  };
  subStats: SubStat[];
  equippedBy?: string; // agent id
  lock: boolean;
}
