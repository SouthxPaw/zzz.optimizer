// models/agent.model.ts
export type Element = 'Physical' | 'Fire' | 'Ice' | 'Electric' | 'Wind' | 'Ether' | 'Lumen';
export type Specialty = 'Attack' | 'Stun' | 'Support' | 'Defense' | 'Anomaly' | 'Rupture';
export type DiscSlot = 'Drive1' | 'Drive2' | 'Drive3' | 'Drive4' | 'Drive5' | 'Drive6';

export interface BaseStats {
  hp: number;
  hppercent: number;
  atk: number;
  atkpercent: number;
  def: number;
  defpercent: number;
  impact: number;
  impactpercent: number;  // Percentage bonuses (disc 6 main stat, set bonuses)
  anomalyMastery: number;
  anomalyMasteryPercent: number;  // Percentage bonuses (disc 6 main stat, set bonuses)
  critRate: number;
  critDmg: number;
  anomalyProficiency: number;
  pen: number;  // Flat PEN (converted to penRatio for display)
  penRatio: number;
  energyRegen: number;  // Base energy regen (SpBarPoint) - stored as energy/sec
  energyRegenPercent: number;  // Percentage bonuses to energy regen
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
  specialElementIcon?: string;  // For special element variants (Frost, AuricInk, HonedEdge)
  specialtyIcon?: string;
  mindscapeEffects?: MindscapeEffect[];
  coreSkill?: string;
  scoring?: AgentScoring;
  hasHPAscension?: boolean;      // true for agents with HP% ascension bonus (Zhao, Manato)
  hpAscensionPercent?: number;   // HP ascension percentage (e.g., 18 for 18%)
}

export interface AgentScoring {
  buffs?: AgentBuff[];
  debuffs?: any[];
  dazeBonus?: number;
}

export interface AgentBuff {
  type: string;  // e.g., 'ATKBonus', 'CRITRateBonus', 'CRITDMGBonus', etc.
  value: string;  // String number like '1000' or '40'
  format: '%' | 'flat';
  condition?: {
    sourceStat: string;      // Source stat to read (e.g., 'anomalyMastery')
    threshold: number;       // Minimum value before conversion starts
    ratio: number;           // Conversion ratio (e.g., 1.0 for 1:1)
    cap?: number;            // Maximum value the bonus can provide
  };
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
  format?: '%' | 'flat'; // New field to distinguish percentage vs flat stats
}

// models/wengine.model.ts
export interface WEngineRefinementProperty {
  name: string;
  type: 'ATK%' | 'HP%' | 'DEF%' | 'CRIT_Rate' | 'CRIT_DMG' | 'PEN_Ratio' | 'Energy_Regen' | 'Impact' | 'Anomaly_Proficiency' | 'Anomaly_Mastery';
  values: {
    W1: number;
    W2: number;
    W3: number;
    W4: number;
    W5: number;
  };
}

export interface WEngine {
  id: string;
  name: string;
  rarity: 'S' | 'A' | 'B';
  specialty: 'Attack' | 'Stun' | 'Anomaly' | 'Support' | 'Defense' | 'Rupture';
  baseAtk: number;
  subStat: {
    type: 'ATK%' | 'HP%' | 'DEF%' | 'CRIT_Rate' | 'CRIT_DMG' | 'PEN_Ratio' | 'Energy_Regen' | 'Impact' | 'Anomaly_Proficiency' | 'Anomaly_Mastery';
    value: number;
  };
  effect: {
    name: string;
    description: string;
    maxRefinement?: string;
    properties?: WEngineRefinementProperty[];
  };
  signature?: string;
}
