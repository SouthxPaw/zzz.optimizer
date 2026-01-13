// services/stat-calculator.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Agent, BaseStats, DiscSlot } from '../models/agent.model';
import { Disc, SubStatType } from '../models/disc.model';
import { WEngine } from '../models/wengine.model';
import { DISC_SETS } from '../constants/disc-sets';
import { DISC_SET_EQUIPMENT_IDS } from '../constants/disc-set-ids';

interface DiscSetEquipmentData {
  Id: number;
  Name: string;
  Desc2: string;
  Desc4: string;
  '4pcEffect': {
    Properties: Array<{
      Name: string;
      Name2: string;
      Format: string;
      Value: number;
    }>;
  } | Array<{
    Condition?: {
      Type: string;
      Stat: string;
      Operator: string;
      Value: number;
    };
    Properties: Array<{
      Name: string;
      Name2: string;
      Format: string;
      Value: number;
    }>;
  }>;
}

@Injectable({
  providedIn: 'root'
})
export class StatCalculatorService {
  private discSetEquipmentData: { [setName: string]: DiscSetEquipmentData } = {};
  private dataLoaded = false;
  private dataLoadPromise: Promise<void>;

  constructor(private http: HttpClient) {
    this.dataLoadPromise = this.loadDiscSetEquipmentData();
  }

  /**
   * Ensure disc set equipment data is loaded before calculating stats
   */
  async ensureDataLoaded(): Promise<void> {
    await this.dataLoadPromise;
  }

  /**
   * Load disc set equipment data from JSON files
   */
  private async loadDiscSetEquipmentData() {
    try {
      const promises = DISC_SET_EQUIPMENT_IDS.map(id =>
        firstValueFrom(
          this.http.get<DiscSetEquipmentData>(`assets/data/equipment/${id}.json`)
        ).catch(() => null)
      );

      const results = await Promise.all(promises);
      results.forEach(data => {
        if (data) {
          this.discSetEquipmentData[data.Name] = data;
        }
      });

      this.dataLoaded = true;
      console.log('Loaded disc set equipment data for stat calculation');
    } catch (error) {
      console.error('Failed to load disc set equipment data:', error);
    }
  }

  calculateFinalStats(
    agent: Agent,
    level: number,
    wEngine: WEngine | null,
    discs: { [key in DiscSlot]?: Disc },
    mindscapeLevel: number = 0,
    wEngineRefinement: number = 1
  ): BaseStats {
    // Start with base stats at level 60
    const stats: BaseStats = { ...agent.lvl60Stats };

    // Apply W-Engine stats
    if (wEngine) {
      this.applyWEngineStats(stats, wEngine, agent, wEngineRefinement);
    }

    // Apply mindscape stat bonuses
    if (agent.mindscapeEffects && mindscapeLevel > 0) {
      this.applyMindscapeStats(stats, agent, mindscapeLevel);
    }

    // Apply disc main stats
    this.applyDiscMainStats(stats, discs, agent);

    // Apply disc substats
    this.applyDiscSubStats(stats, discs, agent);

    // Apply set bonuses
    this.applySetBonuses(stats, discs, agent);

    // Convert flat PEN to PEN Ratio (using 800 as baseline enemy DEF)
    const penRatioFromFlat = (stats.pen / 800) * 100;
    const totalPenRatio = stats.penRatio + penRatioFromFlat;

    // Round all stats to avoid decimals
    return {
      hp: Math.round(stats.hp),
      hppercent: Math.round(stats.hppercent * 10) / 10, // Round to 1 decimal
      atk: Math.round(stats.atk),
      atkpercent: Math.round(stats.atkpercent * 10) / 10,
      def: Math.round(stats.def),
      defpercent: Math.round(stats.defpercent * 10) / 10,
      impact: Math.round(stats.impact),
      anomalyMastery: Math.round(stats.anomalyMastery),
      critRate: Math.round(stats.critRate * 10) / 10,
      critDmg: Math.round(stats.critDmg * 10) / 10,
      anomalyProficiency: Math.round(stats.anomalyProficiency),
      pen: Math.round(stats.pen),
      penRatio: Math.round(totalPenRatio * 10) / 10,
      energyRegen: Math.round(stats.energyRegen * 10) / 10
    };
  }

  private applyWEngineStats(stats: BaseStats, wEngine: WEngine, agent: Agent, refinement: number = 1): void {
    // Add base ATK from W-Engine
    stats.atk += wEngine.baseAtk;

    // Apply W-Engine substat
    const subStatType = wEngine.subStat.type;
    const subStatValue = wEngine.subStat.value;

    switch(subStatType) {
      case 'ATK%':
        stats.atkpercent += subStatValue;
        break;
      case 'CRIT_Rate':
        stats.critRate += subStatValue;
        break;
      case 'CRIT_DMG':
        stats.critDmg += subStatValue;
        break;
      case 'HP%':
        stats.hppercent += subStatValue;
        break;
      case 'DEF%':
        stats.defpercent += subStatValue;
        break;
      case 'PEN_Ratio':
        stats.penRatio += subStatValue;
        break;
      case 'Energy_Regen':
        stats.energyRegen += subStatValue;
        break;
      case 'Impact':
        stats.impact += subStatValue;
        break;
      case 'Anomaly_Proficiency':
        stats.anomalyProficiency += subStatValue;
        break;
    }

    // Apply refinement bonuses ONLY if W-Engine specialty matches agent specialty
    if (wEngine.specialty === agent.specialty && wEngine.effect.properties) {
      this.applyRefinementBonuses(stats, wEngine.effect.properties, refinement);
    }
  }

  /**
   * Apply W-Engine refinement bonuses based on refinement level
   * @param stats The stats object to modify
   * @param properties The refinement properties from the W-Engine
   * @param refinement The refinement level (1-5)
   */
  private applyRefinementBonuses(stats: BaseStats, properties: any[], refinement: number): void {
    const refinementKey = `W${Math.min(Math.max(refinement, 1), 5)}` as 'W1' | 'W2' | 'W3' | 'W4' | 'W5';

    properties.forEach(prop => {
      const value = prop.values[refinementKey];
      const type = prop.type;

      switch(type) {
        case 'ATK%':
          stats.atkpercent += value;
          break;
        case 'HP%':
          stats.hppercent += value;
          break;
        case 'DEF%':
          stats.defpercent += value;
          break;
        case 'CRIT_Rate':
          stats.critRate += value;
          break;
        case 'CRIT_DMG':
          stats.critDmg += value;
          break;
        case 'PEN_Ratio':
          stats.penRatio += value;
          break;
        case 'Energy_Regen':
          stats.energyRegen += value;
          break;
        case 'Impact':
          stats.impact += value;
          break;
        case 'Anomaly_Proficiency':
          stats.anomalyProficiency += value;
          break;
      }
    });
  }

  /**
   * Apply mindscape stat bonuses based on mindscape level
   * Only applies bonuses from mindscapes at or below the current level
   * Only applies unconditional bonuses (conditional bonuses are ignored)
   */
  private applyMindscapeStats(stats: BaseStats, agent: Agent, mindscapeLevel: number): void {
    if (!agent.mindscapeEffects || mindscapeLevel === 0) {
      return;
    }

    // Apply stat bonuses from all unlocked mindscapes (level 1 through mindscapeLevel)
    agent.mindscapeEffects.forEach(mindscape => {
      if (mindscape.level <= mindscapeLevel && mindscape.statBonuses) {
        mindscape.statBonuses.forEach(bonus => {
          // Only apply unconditional bonuses
          if (!bonus.conditional) {
            const value = bonus.value;
            const type = bonus.type;

            switch(type) {
              case 'ATK%':
                stats.atkpercent += value;
                break;
              case 'HP%':
                stats.hppercent += value;
                break;
              case 'DEF%':
                stats.defpercent += value;
                break;
              case 'CRIT_Rate':
                stats.critRate += value;
                break;
              case 'CRIT_DMG':
                stats.critDmg += value;
                break;
              case 'PEN_Ratio':
                stats.penRatio += value;
                break;
              case 'Energy_Regen':
                stats.energyRegen += value;
                break;
              case 'Anomaly_Proficiency':
                stats.anomalyProficiency += value;
                break;
              case 'Anomaly_Mastery':
                stats.anomalyMastery += value;
                break;
              case 'Impact':
                stats.impact += value;
                break;
            }
          }
        });
      }
    });
  }

  private applyDiscMainStats(
    stats: BaseStats,
    discs: { [key in DiscSlot]?: Disc },
    agent: Agent
  ): void {
    Object.values(discs).forEach(disc => {
      if (!disc) return;

      const mainStat = disc.mainStat;

      switch(mainStat.type) {
        case 'HP':
          stats.hp += mainStat.value;
          break;
        case 'HP%':
          stats.hppercent += mainStat.value;
          break;
        case 'ATK':
          stats.atk += mainStat.value;
          break;
        case 'ATK%':
          stats.atkpercent += mainStat.value;
          break;
        case 'DEF':
          stats.def += mainStat.value;
          break;
        case 'DEF%':
          stats.defpercent += mainStat.value;
          break;
        case 'CRIT_Rate':
          stats.critRate += mainStat.value;
          break;
        case 'CRIT_DMG':
          stats.critDmg += mainStat.value;
          break;
        case 'Anomaly_Proficiency':
          stats.anomalyProficiency += mainStat.value;
          break;
        case 'Anomaly_Mastery':
          stats.anomalyMastery += mainStat.value;
          break;
        case 'Pen_Ratio':
          stats.penRatio += mainStat.value;
          break;
        case 'Impact':
          stats.impact += mainStat.value;
          break;
        case 'Energy_Regen':
          stats.energyRegen += mainStat.value;
          break;
        case 'Element_DMG':
          // Element DMG is typically tracked separately per element
          // For now we'll skip it in base stats
          break;
      }
    });
  }

  private applyDiscSubStats(
    stats: BaseStats,
    discs: { [key in DiscSlot]?: Disc },
    agent: Agent
  ): void {
    Object.values(discs).forEach(disc => {
      if (!disc) return;

      disc.subStats.forEach(subStat => {
        switch(subStat.type) {
          case 'HP':
            stats.hp += subStat.value;
            break;
          case 'HP%':
            stats.hppercent += subStat.value;
            break;
          case 'ATK':
            stats.atk += subStat.value;
            break;
          case 'ATK%':
            stats.atkpercent += subStat.value;
            break;
          case 'DEF':
            stats.def += subStat.value;
            break;
          case 'DEF%':
            stats.defpercent += subStat.value;
            break;
          case 'CRIT_Rate':
            stats.critRate += subStat.value;
            break;
          case 'CRIT_DMG':
            stats.critDmg += subStat.value;
            break;
          case 'Anomaly_Proficiency':
            stats.anomalyProficiency += subStat.value;
            break;
          case 'PEN':
            stats.pen += subStat.value;
            break;
          case 'Impact':
            stats.impact += subStat.value;
            break;
          case 'Energy_Regen':
            stats.energyRegen += subStat.value;
            break;
        }
      });
    });
  }

  private applySetBonuses(
    stats: BaseStats,
    discs: { [key in DiscSlot]?: Disc },
    agent: Agent
  ): void {
    // Count disc sets
    const setCounts = new Map<string, number>();
    Object.values(discs).forEach(disc => {
      if (!disc) return;
      const count = setCounts.get(disc.set) || 0;
      setCounts.set(disc.set, count + 1);
    });

    // Apply bonuses for sets with 2 or 4 pieces
    setCounts.forEach((count, setName) => {
      const discSet = DISC_SETS.find(s => s.name === setName);
      if (!discSet) return;

      discSet.bonuses.forEach(bonus => {
        if (count >= bonus.pieces) {
          // Parse bonus description and apply stats (2pc bonuses)
          this.parseAndApplyBonus(bonus.description, stats);
        }
      });

      // Apply 4pc effect stat bonuses from equipment data
      if (count >= 4) {
        this.apply4pcEffectBonuses(setName, stats);
      }
    });

    // Apply percentage-based stats to base stats
    // Important: We need to preserve the flat stats already accumulated (from W-Engine base ATK, disc flat stats)
    const baseHP = agent.lvl60Stats.hp;
    const baseATK = agent.lvl60Stats.atk;
    const baseDEF = agent.lvl60Stats.def;

    // Calculate the flat stat bonuses that have been added
    const flatHPBonus = stats.hp - baseHP;
    const flatATKBonus = stats.atk - baseATK;
    const flatDEFBonus = stats.def - baseDEF;

    // Apply percentage bonuses to base stats, then add back the flat bonuses
    stats.hp = baseHP * (1 + stats.hppercent / 100) + flatHPBonus;
    stats.atk = baseATK * (1 + stats.atkpercent / 100) + flatATKBonus;
    stats.def = baseDEF * (1 + stats.defpercent / 100) + flatDEFBonus;
  }

  /**
   * Apply 4pc effect stat bonuses from equipment data
   * Only applies conditional bonuses when conditions are met
   */
  private apply4pcEffectBonuses(setName: string, stats: BaseStats): void {
    const equipmentData = this.discSetEquipmentData[setName];
    if (!equipmentData || !equipmentData['4pcEffect']) {
      return;
    }

    const effect = equipmentData['4pcEffect'];

    // Handle simple format (object with Properties array)
    if (!Array.isArray(effect)) {
      this.applyPropertiesArray(effect.Properties, stats);
    }
    // Handle conditional format (array of effect objects)
    else {
      effect.forEach(effectPart => {
        // Only apply if condition is met or no condition exists
        if (!effectPart.Condition || this.evaluateCondition(effectPart.Condition, stats)) {
          this.applyPropertiesArray(effectPart.Properties, stats);
        }
      });
    }
  }

  /**
   * Evaluate if a condition is met based on current stats
   */
  private evaluateCondition(
    condition: { Type: string; Stat: string; Operator: string; Value: number },
    stats: BaseStats
  ): boolean {
    // Map condition stat names to BaseStats properties
    const statMapping: { [key: string]: keyof BaseStats } = {
      'Anomaly_Mastery': 'anomalyMastery',
      'Anomaly_Proficiency': 'anomalyProficiency',
      'CRIT_Rate': 'critRate',
      'CRIT_DMG': 'critDmg',
      'ATK': 'atk',
      'ATK%': 'atkpercent',
      'HP': 'hp',
      'HP%': 'hppercent',
      'DEF': 'def',
      'DEF%': 'defpercent',
      'Impact': 'impact',
      'PEN': 'pen',
      'PEN_Ratio': 'penRatio',
      'Energy_Regen': 'energyRegen'
    };

    const statKey = statMapping[condition.Stat];
    if (!statKey) {
      console.warn(`Unknown stat in condition: ${condition.Stat}`);
      return false;
    }

    const currentValue = stats[statKey] as number;

    switch (condition.Operator) {
      case '>=':
        return currentValue >= condition.Value;
      case '>':
        return currentValue > condition.Value;
      case '<=':
        return currentValue <= condition.Value;
      case '<':
        return currentValue < condition.Value;
      case '==':
        return currentValue === condition.Value;
      default:
        console.warn(`Unknown operator in condition: ${condition.Operator}`);
        return false;
    }
  }

  /**
   * Apply an array of property bonuses to stats
   */
  private applyPropertiesArray(
    properties: Array<{ Name: string; Name2: string; Format: string; Value: number }>,
    stats: BaseStats
  ): void {
    properties.forEach(prop => {
      const statType = prop.Name;
      // Value is stored as integer (e.g., 2800 = 28%, 36 = 36 flat)
      const value = prop.Format.includes('%') ? prop.Value / 100 : prop.Value;

      switch (statType) {
        case 'ATK%':
          stats.atkpercent += value;
          break;
        case 'HP%':
          stats.hppercent += value;
          break;
        case 'DEF%':
          stats.defpercent += value;
          break;
        case 'CRIT_Rate':
        case 'CRIT_RATE':
          stats.critRate += value;
          break;
        case 'CRIT_DMG':
          stats.critDmg += value;
          break;
        case 'PEN_Ratio':
          stats.penRatio += value;
          break;
        case 'Energy_Regen':
          stats.energyRegen += value;
          break;
        case 'Impact':
          stats.impact += value;
          break;
        case 'Anomaly_Proficiency':
          stats.anomalyProficiency += value;
          break;
        case 'Anomaly_Mastery':
          stats.anomalyMastery += value;
          break;
        case 'ATK':
          stats.atk += value;
          break;
        case 'HP':
          stats.hp += value;
          break;
        case 'DEF':
          stats.def += value;
          break;
        case 'PEN':
          stats.pen += value;
          break;
      }
    });
  }

  /**
   * Parse bonus description and apply stat changes
   */
  private parseAndApplyBonus(description: string, stats: BaseStats): void {
    // Match patterns like "ATK +10%" or "CRIT Rate +8%" or "Anomaly Proficiency +30"
    const percentMatch = description.match(/(ATK|HP|DEF|CRIT Rate|CRIT DMG|PEN Ratio|Energy Regen|Impact)\s*\+(\d+(?:\.\d+)?)%/i);
    const flatMatch = description.match(/(Anomaly Proficiency|Anomaly Mastery)\s*\+(\d+)/i);

    if (percentMatch) {
      const [, stat, value] = percentMatch;
      const numValue = parseFloat(value);

      switch (stat.toUpperCase()) {
        case 'ATK':
          stats.atkpercent += numValue;
          break;
        case 'HP':
          stats.hppercent += numValue;
          break;
        case 'DEF':
          stats.defpercent += numValue;
          break;
        case 'CRIT RATE':
          stats.critRate += numValue;
          break;
        case 'CRIT DMG':
          stats.critDmg += numValue;
          break;
        case 'PEN RATIO':
          stats.penRatio += numValue;
          break;
        case 'ENERGY REGEN':
          stats.energyRegen += numValue;
          break;
        case 'IMPACT':
          stats.impact += numValue;
          break;
      }
    } else if (flatMatch) {
      const [, stat, value] = flatMatch;
      const numValue = parseInt(value);

      if (stat.includes('Proficiency')) {
        stats.anomalyProficiency += numValue;
      } else if (stat.includes('Mastery')) {
        stats.anomalyMastery += numValue;
      }
    }
  }

  getSetBonuses(discs: { [key in DiscSlot]?: Disc }): string[] {
    const setCounts = new Map<string, number>();
    Object.values(discs).forEach(disc => {
      if (!disc) return;
      const count = setCounts.get(disc.set) || 0;
      setCounts.set(disc.set, count + 1);
    });

    const activeBonuses: string[] = [];
    setCounts.forEach((count, setName) => {
      const discSet = DISC_SETS.find(s => s.name === setName);
      if (!discSet) return;

      // Show all active bonuses with their descriptions
      discSet.bonuses.forEach(bonus => {
        if (count >= bonus.pieces) {
          activeBonuses.push(`${setName} (${bonus.pieces}pc): ${bonus.description}`);
        }
      });
    });

    return activeBonuses;
  }

  /**
   * Get active 4pc effect stat bonuses for UI display
   * Returns formatted strings similar to 2pc bonuses
   * Only includes conditional bonuses when conditions are met
   */
  get4pcEffectBonuses(
    discs: { [key in DiscSlot]?: Disc },
    agent: Agent,
    wEngine: WEngine | null,
    mindscapeLevel: number = 0,
    wEngineRefinement: number = 1
  ): string[] {
    const setCounts = new Map<string, number>();
    Object.values(discs).forEach(disc => {
      if (!disc) return;
      const count = setCounts.get(disc.set) || 0;
      setCounts.set(disc.set, count + 1);
    });

    // Calculate current stats to check conditions
    const currentStats = this.calculateFinalStats(agent, 60, wEngine, discs, mindscapeLevel, wEngineRefinement);

    const active4pcBonuses: string[] = [];

    setCounts.forEach((count, setName) => {
      if (count >= 4) {
        const equipmentData = this.discSetEquipmentData[setName];
        if (equipmentData && equipmentData['4pcEffect']) {
          const effect = equipmentData['4pcEffect'];
          const statParts: string[] = [];

          // Handle simple format (unconditional)
          if (!Array.isArray(effect)) {
            effect.Properties.forEach(prop => {
              const value = prop.Format.includes('%') ? prop.Value / 100 : prop.Value;
              const formattedValue = prop.Format.includes('%') ? `${value}%` : value;
              const formattedStatName = prop.Name2.replace(/_/g, ' ');
              statParts.push(`${formattedStatName}: +${formattedValue}`);
            });
          }
          // Handle conditional format
          else {
            effect.forEach(effectPart => {
              // Only include stats if there's no condition OR condition is met
              if (!effectPart.Condition || this.evaluateCondition(effectPart.Condition, currentStats)) {
                effectPart.Properties.forEach(prop => {
                  const value = prop.Format.includes('%') ? prop.Value / 100 : prop.Value;
                  const formattedValue = prop.Format.includes('%') ? `${value}%` : value;
                  const formattedStatName = prop.Name2.replace(/_/g, ' ');
                  statParts.push(`${formattedStatName}: +${formattedValue}`);
                });
              }
            });
          }

          if (statParts.length > 0) {
            active4pcBonuses.push(`${setName} (4pc): ${statParts.join(', ')}`);
          }
        }
      }
    });

    return active4pcBonuses;
  }

}
