// services/stat-calculator.service.ts
import { Injectable } from '@angular/core';
import { Agent, BaseStats, DiscSlot } from '../models/agent.model';
import { Disc, SubStatType } from '../models/disc.model';
import { WEngine } from '../models/wengine.model';
import { DISC_SETS } from '../constants/disc-sets';

@Injectable({
  providedIn: 'root'
})
export class StatCalculatorService {

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
          // Parse bonus description and apply stats
          this.parseAndApplyBonus(bonus.description, stats);
        }
      });
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
}
