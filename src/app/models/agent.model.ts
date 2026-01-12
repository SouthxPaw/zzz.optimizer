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
  pen: number;  // Flat PEN (converted to penRatio for display)
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
  icon?: string;
  elementIcon?: string;
  specialtyIcon?: string;
  mindscapeEffects?: MindscapeEffect[];
  coreSkill?: string;
}

export interface MindscapeEffect {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  name: string;
  description: string;
  statBonuses?: MindscapeStatBonus[];
}

export interface MindscapeStatBonus {
  type: 'ATK%' | 'HP%' | 'DEF%' | 'CRIT_Rate' | 'CRIT_DMG' | 'PEN_Ratio' | 'Energy_Regen' | 'Anomaly_Proficiency' | 'Anomaly_Mastery' | 'Impact';
  value: number;
  conditional: boolean; // true if bonus requires conditions, false if always active
}

// models/wengine.model.ts
export interface WEngine {
  id: string;
  name: string;
  rarity: 'S' | 'A' | 'B';
  specialty: 'Attack' | 'Stun' | 'Anomaly' | 'Support' | 'Defense' | 'Rupture';
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
