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
    mindscapeLevel: number = 0
  ): BaseStats {
    // Start with base stats at level 60
    const stats: BaseStats = { ...agent.lvl60Stats };

    // Apply W-Engine stats
    if (wEngine) {
      this.applyWEngineStats(stats, wEngine, agent);
    }

    // Apply disc main stats
    this.applyDiscMainStats(stats, discs, agent);

    // Apply disc substats
    this.applyDiscSubStats(stats, discs, agent);

    // Apply set bonuses
    this.applySetBonuses(stats, discs, agent);

    return stats;
  }

  private applyWEngineStats(stats: BaseStats, wEngine: WEngine, agent: Agent): void {
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

    // Note: W-Engine effects are not automatically applied as they are context-dependent
    // and described in natural language. They should be considered when evaluating builds
    // but cannot be parsed into stats programmatically.
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
          case 'Pen_Ratio':
            stats.penRatio += subStat.value;
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
          // This is simplified - you may want to make this more robust
          if (bonus.description.includes('ATK +10%')) {
            stats.atkpercent += 10;
          } else if (bonus.description.includes('CRIT Rate +8%')) {
            stats.critRate += 8;
          } else if (bonus.description.includes('Anomaly Proficiency +30')) {
            stats.anomalyProficiency += 30;
          } else if (bonus.description.includes('PEN Ratio +8%')) {
            stats.penRatio += 8;
          } else if (bonus.description.includes('Energy Regen +20%')) {
            stats.energyRegen += 20;
          } else if (bonus.description.includes('Impact +6%')) {
            stats.impact += 6;
          }
          // Element DMG bonuses would be tracked separately
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

  getSetBonuses(discs: { [key in DiscSlot]?: Disc }): string[] {
    const setCounts = new Map<string, number>();
    Object.values(discs).forEach(disc => {
      if (!disc) return;
      const count = setCounts.get(disc.set) || 0;
      setCounts.set(disc.set, count + 1);
    });

    const activeBonuses: string[] = [];
    setCounts.forEach((count, setName) => {
      if (count >= 4) {
        activeBonuses.push(`${setName} (4)`);
      } else if (count >= 2) {
        activeBonuses.push(`${setName} (2)`);
      }
    });

    return activeBonuses;
  }
}
