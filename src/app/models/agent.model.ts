// models/agent.model.ts
export type Element = 'Physical' | 'Fire' | 'Ice' | 'Electric' | 'Wind' | 'Ether' | 'Lumen';
export type Specialty = 'Attack' | 'Stun' | 'Support' | 'Defense' | 'Anomaly' | 'Rupture' | 'Armorer';
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
  flatImpact: number;  // Flat Impact bonuses from passives (Nangong Yu, Dialyn, Zhu Yuan)
  anomalyMastery: number;
  anomalyMasteryPercent: number;  // Percentage bonuses (disc 6 main stat, set bonuses)
  critRate: number;
  critDmg: number;
  anomalyProficiency: number;
  pen: number;  // Flat PEN (converted to penRatio for display)
  penRatio: number;
  energyRegen: number;  // Base energy regen (SpBarPoint) - stored as energy/sec
  energyRegenPercent: number;  // Percentage bonuses to energy regen
  sheerForce: number;  // Sheer Force for Rupture agents: floor(ATK × 0.3) + floor(HP × 0.1)
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
  extra_ascension?: any[];       // Core passive bonuses unlocked at levels 15, 25, 35, 45, 55
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
    ratio: number;           // Conversion ratio (e.g., 1.0 for 1:1) - W5 / default
    cap?: number;            // Maximum value the bonus can provide - W5 / default
    // Optional per-refinement values for W-Engine conditionals whose ratio and/or
    // cap scale with Overclock (e.g. Bloodmarrow Coffer). When present and the
    // equipped refinement is known, these override the flat ratio/cap above.
    // The top-level ratio/cap remain the W5 fallback for callers that do not
    // supply a refinement.
    Overclock?: {
      [rank: string]: { ratio?: number; cap?: number };
    };
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
  type: 'ATK%' | 'HP%' | 'DEF%' | 'CRIT_Rate' | 'CRIT_DMG' | 'PEN_Ratio' | 'Energy_Regen' | 'Impact' | 'Anomaly_Proficiency' | 'Anomaly_Mastery' | 'Sheer_Force' | 'Sheer Force';
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
  specialty: 'Attack' | 'Stun' | 'Anomaly' | 'Support' | 'Defense' | 'Rupture' | 'Armorer';
  baseAtk: number;
  subStat: {
    type: 'ATK%' | 'HP%' | 'DEF%' | 'CRIT_Rate' | 'CRIT_DMG' | 'PEN_Ratio' | 'Energy_Regen' | 'Impact' | 'Anomaly_Proficiency' | 'Anomaly_Mastery' | 'Sheer_Force' | 'Sheer Force';
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
