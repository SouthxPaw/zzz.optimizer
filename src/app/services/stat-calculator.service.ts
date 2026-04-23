// services/stat-calculator.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Agent, BaseStats, DiscSlot } from '../models/agent.model';
import { Disc } from '../models/disc.model';
import { WEngine, RefinementProperty } from '../models/wengine.model';
// DISC_SETS import removed - now using equipment data from DiscSetDataService
import { DiscSetDataService, DiscSetEquipmentData } from './disc-set-data.service';
import { versionedUrl } from '../utils/versioned-url';

interface MindscapeStatBonus {
  type: string;
  value: number;
  format: string;
  note: string;
}

interface MindscapeData {
  mindscapes: {
    [agentId: string]: {
      comment?: string;
      [level: number]: MindscapeStatBonus[];
    };
  };
}

@Injectable({
  providedIn: 'root'
})
export class StatCalculatorService {
  // OPTIMIZATION 4: Increased cache size for better performance
  private statCache = new Map<string, BaseStats>();
  private readonly CACHE_SIZE_LIMIT = 10000; // Up from 1000 for 20-30% speedup

  // OPTIMIZATION 5: Set bonus caching
  private setBonusCache = new Map<string, any>();

  // Mindscape data loaded from mindscape-stats.json (manually curated source of truth)
  private mindscapeData: MindscapeData | null = null;
  private mindscapeDataPromise: Promise<void> | null = null;

  // OPTIMIZATION: Use shared disc set data service
  constructor(
    private discSetDataService: DiscSetDataService,
    private http: HttpClient
  ) {
    // Data loading is handled by shared service
    this.discSetDataService.loadDiscSetData();
    this.mindscapeDataPromise = this.loadMindscapeData();
  }

  /**
   * Load mindscape stat bonuses from the manually-curated JSON file.
   * This is the source of truth for mindscape bonuses used in stat calculations.
   * Returns a promise that can be awaited to ensure data is loaded before use.
   */
  private async loadMindscapeData(): Promise<void> {
    try {
      this.mindscapeData = await firstValueFrom(
        this.http.get<MindscapeData>(versionedUrl('assets/data/mindscape-stats.json'))
      );
    } catch (error) {
      console.error('Failed to load mindscape data:', error);
    }
  }

  /**
   * Ensure disc set equipment data and mindscape data are loaded before calculating stats
   */
  async ensureDataLoaded(): Promise<void> {
    await this.discSetDataService.loadDiscSetData();
    if (this.mindscapeDataPromise) {
      await this.mindscapeDataPromise;
    }
  }

  calculateFinalStats(
    agent: Agent,
    level: number,
    wEngine: WEngine | null,
    discs: { [key in DiscSlot]?: Disc },
    mindscapeLevel: number = 0,
    wEngineRefinement: number = 1,
    includeWEngineBonuses: boolean = true,
    includeMindscapeBonuses: boolean = true,
    includePassiveBonuses: boolean = true,
    enabledDiscs: { [slot: string]: boolean } = {}
  ): BaseStats {

    // Generate cache key (include all bonus flags and enabled discs in cache)
    const enabledDiscsKey = Object.keys(discs).map(slot => `${slot}:${enabledDiscs[slot] ?? true}`).join(',');
    const cacheKey = this.generateCacheKey(agent.id, level, wEngine?.id, discs, mindscapeLevel, wEngineRefinement) + `:${includeWEngineBonuses}:${includeMindscapeBonuses}:${includePassiveBonuses}:${enabledDiscsKey}`;

    // Check cache
    const cached = this.statCache.get(cacheKey);
    if (cached) {
      return cached;
    }


    // Start with base stats at level 60
    // Initialize percent bonuses to 0 since they may not exist in older data
    const stats: BaseStats = {
      ...agent.lvl60Stats,
      anomalyMasteryPercent: 0,
      energyRegenPercent: 0
    };


    // Apply W-Engine stats (if enabled)
    if (includeWEngineBonuses && wEngine) {
      this.applyWEngineStats(stats, wEngine, agent, wEngineRefinement);
    } else {
    }

    // Apply mindscape stat bonuses (if enabled)
    if (includeMindscapeBonuses && mindscapeLevel > 0) {
      this.applyMindscapeStats(stats, agent, mindscapeLevel);
    } else {
    }

    // Filter out disabled discs
    const enabledDiscsOnly = Object.fromEntries(
      Object.entries(discs).filter(([slot, disc]) => disc && (enabledDiscs[slot] ?? true))
    ) as { [key in DiscSlot]?: Disc };

    // Apply disc main stats (only from enabled discs)
    this.applyDiscMainStats(stats, enabledDiscsOnly);

    // Apply disc substats (only from enabled discs)
    this.applyDiscSubStats(stats, enabledDiscsOnly);

    // Apply set bonuses (this applies percentage bonuses to HP/ATK/DEF, counting only enabled discs)
    this.applySetBonuses(stats, enabledDiscsOnly, agent, wEngine, includeWEngineBonuses);

    // Apply conditional 4pc bonuses AFTER final stats are calculated (so conditions can check final values)
    this.applyConditional4pcBonuses(stats, enabledDiscsOnly, agent);

    // Apply passive scoring bonuses AFTER discs (for conditional stat conversions that depend on final stat values)
    if (includePassiveBonuses && agent.scoring?.buffs) {
      this.applyPassiveScoringBonuses(stats, agent);
    } else {
    }

    // Calculate final energy regen using correct formula:
    // Energy/sec = Base × (1 + Σ %bonuses/100)
    const finalEnergyRegen = stats.energyRegen * (1 + stats.energyRegenPercent / 100);

    // Round all stats to avoid decimals
    const finalStats: BaseStats = {
      hp: Math.round(stats.hp),
      hppercent: Math.round(stats.hppercent * 10) / 10, // Round to 1 decimal
      atk: Math.round(stats.atk),
      atkpercent: Math.round(stats.atkpercent * 10) / 10,
      def: Math.round(stats.def),
      defpercent: Math.round(stats.defpercent * 10) / 10,
      impact: Math.round(stats.impact),
      anomalyMastery: Math.round(stats.anomalyMastery),
      anomalyMasteryPercent: Math.round(stats.anomalyMasteryPercent * 10) / 10,
      critRate: Math.round(stats.critRate * 10) / 10,
      critDmg: Math.round(stats.critDmg * 10) / 10,
      anomalyProficiency: Math.round(stats.anomalyProficiency),
      pen: Math.round(stats.pen),
      penRatio: Math.round(stats.penRatio * 10) / 10,
      energyRegen: Math.round(finalEnergyRegen * 10) / 10,
      energyRegenPercent: Math.round(stats.energyRegenPercent * 10) / 10
    };

    // Store in cache
    this.addToCache(cacheKey, finalStats);

    return finalStats;
  }

  private generateCacheKey(
    agentId: string,
    level: number,
    wEngineId: string | undefined,
    discs: { [key in DiscSlot]?: Disc },
    mindscapeLevel: number,
    wEngineRefinement: number
  ): string {
    // Create a deterministic key from disc UIDs, main stats, and substats
    // All stat fields must be included so cache invalidates when any disc stat is edited
    const discInfo = Object.entries(discs)
      .filter(([_, disc]) => disc !== undefined)
      .map(([slot, disc]) => {
        const subKey = disc!.subStats.map(s => `${s.type}:${s.value}`).join(',');
        return `${slot}:${disc!.uid}:${disc!.mainStat.type}:${disc!.mainStat.value}:${subKey}`;
      })
      .sort()
      .join('|');

    return `${agentId}:${level}:${wEngineId || 'none'}:${mindscapeLevel}:${wEngineRefinement}:${discInfo}`;
  }

  private addToCache(key: string, stats: BaseStats): void {
    // OPTIMIZATION 4: Better LRU eviction - delete oldest 10% when limit reached
    if (this.statCache.size >= this.CACHE_SIZE_LIMIT) {
      const deleteCount = Math.floor(this.CACHE_SIZE_LIMIT * 0.1);
      const keysToDelete = Array.from(this.statCache.keys()).slice(0, deleteCount);
      keysToDelete.forEach(k => this.statCache.delete(k));
    }
    this.statCache.set(key, stats);
  }

  clearCache(): void {
    this.statCache.clear();
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
        // W-Engine Energy Regen is a percentage bonus
        stats.energyRegenPercent += subStatValue;
        break;
      case 'Impact':
        stats.impact += subStatValue;
        break;
      case 'Anomaly_Proficiency':
        stats.anomalyProficiency += subStatValue;
        break;
      case 'Anomaly_Mastery':
        // W-Engine Anomaly Mastery is a percentage bonus
        stats.anomalyMasteryPercent += subStatValue;
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
  private applyRefinementBonuses(stats: BaseStats, properties: RefinementProperty[], refinement: number): void {
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
          // Refinement Energy Regen bonuses are percentage bonuses
          stats.energyRegenPercent += value;
          break;
        case 'Impact':
          stats.impact += value;
          break;
        case 'Anomaly_Proficiency':
          stats.anomalyProficiency += value;
          break;
        case 'Anomaly_Mastery':
          // Refinement Anomaly Mastery bonuses are flat values (Format does not include %)
          // The value has already been processed by extractRefinementProperties
          stats.anomalyMastery += value;
          break;
      }
    });
  }

  /**
   * Apply passive bonuses from agent's scoring buffs
   * These are bonuses that represent the agent's kit at optimal conditions
   * Supports conditional stat conversion (e.g., Nangong Yu: AM > 110 → +1 Impact per point)
   */
  private applyPassiveScoringBonuses(stats: BaseStats, agent: Agent): void {
    if (!agent.scoring?.buffs) {
      return;
    }

    agent.scoring.buffs.forEach(buff => {
      let value = parseFloat(buff.value);
      const isPercentage = buff.format === '%';

      // Handle conditional stat conversion
      if (buff.condition) {
        const sourceStat = this.getStatValue(stats, buff.condition.sourceStat);
        const excess = Math.max(0, sourceStat - buff.condition.threshold);
        value = excess * buff.condition.ratio;

        // Apply cap if specified
        if (buff.condition.cap !== undefined) {
          value = Math.min(value, buff.condition.cap);
        }
      }

      // Map buff types to stat fields
      switch(buff.type) {
        case 'ATKBonus':
          if (isPercentage) {
            stats.atkpercent += value;
          } else {
            stats.atk += value;
          }
          break;
        case 'HPBonus':
          if (isPercentage) {
            stats.hppercent += value;
          } else {
            stats.hp += value;
          }
          break;
        case 'DEFBonus':
          if (isPercentage) {
            stats.defpercent += value;
          } else {
            stats.def += value;
          }
          break;
        case 'CRITRateBonus':
          stats.critRate += value;
          break;
        case 'CRITDMGBonus':
          stats.critDmg += value;
          break;
        case 'PENRatioBonus':
          stats.penRatio += value;
          break;
        case 'AnomalyProficiencyBonus':
        case 'AnomalyProficiency':
          stats.anomalyProficiency += value;
          break;
        case 'AnomalyMasteryBonus':
        case 'AnomalyMastery':
          if (isPercentage) {
            stats.anomalyMasteryPercent += value;
          } else {
            stats.anomalyMastery += value;
          }
          break;
        case 'ImpactBonus':
          stats.impact += value;
          break;
        case 'EnergyRegenBonus':
          if (isPercentage) {
            stats.energyRegenPercent += value;
          } else {
            stats.energyRegen += value;
          }
          break;
      }
    });
  }

  /**
   * Helper to get stat value by string key
   */
  private getStatValue(stats: BaseStats, statKey: string): number {
    const statMap: { [key: string]: keyof BaseStats } = {
      'hp': 'hp',
      'atk': 'atk',
      'def': 'def',
      'impact': 'impact',
      'anomalyMastery': 'anomalyMastery',
      'critRate': 'critRate',
      'critDmg': 'critDmg',
      'anomalyProficiency': 'anomalyProficiency',
      'pen': 'pen',
      'penRatio': 'penRatio',
      'energyRegen': 'energyRegen'
    };

    const mappedKey = statMap[statKey];
    return mappedKey ? stats[mappedKey] : 0;
  }

  /**
   * Apply mindscape stat bonuses based on mindscape level.
   * Reads from mindscape-stats.json (manually curated source of truth)
   * rather than agent.mindscapeEffects (which is populated by fragile regex parsing).
   * Falls back to agent.mindscapeEffects if the JSON file hasn't loaded yet.
   */
  private applyMindscapeStats(stats: BaseStats, agent: Agent, mindscapeLevel: number): void {
    if (mindscapeLevel === 0) {
      return;
    }

    // Preferred path: use manually-curated mindscape-stats.json
    if (this.mindscapeData) {
      const agentMindscapes = this.mindscapeData.mindscapes[agent.id];
      if (!agentMindscapes) {
        return;
      }

      // Apply bonuses from all unlocked mindscape levels (1 through mindscapeLevel)
      for (let level = 1; level <= mindscapeLevel; level++) {
        const bonuses = agentMindscapes[level];
        if (!bonuses) continue;

        bonuses.forEach(bonus => {
          const value = bonus.value;
          const type = bonus.type;
          const isFlat = bonus.format === 'flat';

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
              // format "%" = percentage bonus, format "flat" = flat regen value
              if (isFlat) {
                stats.energyRegen += value;
              } else {
                stats.energyRegenPercent += value;
              }
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
        });
      }
      return;
    }

    // Fallback: use agent.mindscapeEffects (regex-parsed from agent descriptions)
    // This path is used only if mindscape-stats.json hasn't finished loading yet
    if (!agent.mindscapeEffects) {
      return;
    }

    agent.mindscapeEffects.forEach(mindscape => {
      if (mindscape.level <= mindscapeLevel && mindscape.statBonuses) {
        mindscape.statBonuses.forEach(bonus => {
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
                stats.energyRegenPercent += value;
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
    discs: { [key in DiscSlot]?: Disc }
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
          // Disc 6 Anomaly Mastery is a percentage bonus (30%)
          stats.anomalyMasteryPercent += mainStat.value;
          break;
        case 'PEN_Ratio':
          stats.penRatio += mainStat.value;
          break;
        case 'Impact':
          stats.impact += mainStat.value;
          break;
        case 'Energy_Regen':
          // Disc main stat Energy Regen is a percentage bonus
          stats.energyRegenPercent += mainStat.value;
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
    discs: { [key in DiscSlot]?: Disc }
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
          // Note: Impact and Energy_Regen cannot be disc substats, only main stats (Drive 6)
        }
      });
    });
  }

  private applySetBonuses(
    stats: BaseStats,
    discs: { [key in DiscSlot]?: Disc },
    agent: Agent,
    wEngine: WEngine | null,
    includeWEngineBonuses: boolean = true
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
      const equipmentData = this.discSetDataService.getDiscSet(setName);
      if (!equipmentData) {
        return;
      }

      // Apply 2pc bonus from equipment data (Desc2)
      if (count >= 2 && equipmentData.Desc2) {
        this.parseAndApplyBonus(equipmentData.Desc2, stats);
      }

      // Apply 4pc effect stat bonuses from equipment data (ONLY unconditional ones)
      if (count >= 4) {
        this.apply4pcEffectBonuses(setName, stats, agent, false); // false = skip conditional bonuses
      }
    });

    // Apply percentage-based stats according to ZZZ wiki formula:
    // Final Stat = (Base Value × (1 + Percentage Bonuses %)) + Additive Bonuses
    //
    // Where:
    // - Base Value = Agent base stats + W-Engine base ATK (for ATK only)
    // - Percentage Bonuses = All %HP, %ATK, %DEF from discs, W-Engine, mindscape, set bonuses
    // - Additive Bonuses = Flat HP/ATK/DEF from discs ONLY

    const baseHP = agent.lvl60Stats.hp;
    const baseATK = agent.lvl60Stats.atk;
    const baseDEF = agent.lvl60Stats.def;
    const baseAnomalyMastery = agent.lvl60Stats.anomalyMastery;

    // At this point, stats.hp/atk/def contains:
    // - Agent base stats
    // - W-Engine base ATK (for ATK only)
    // - Flat HP/ATK/DEF from discs
    //
    // We need to separate flat disc bonuses and apply the ZZZ formula correctly

    // Calculate flat disc bonuses by subtracting base values
    // Only include W-Engine base ATK if W-Engine bonuses are enabled
    const wEngineBaseATK = (includeWEngineBonuses && wEngine?.baseAtk) ? wEngine.baseAtk : 0;

    const flatHPFromDiscs = stats.hp - baseHP;
    const flatATKFromDiscs = stats.atk - baseATK - wEngineBaseATK;
    const flatDEFFromDiscs = stats.def - baseDEF;

    // For Anomaly Mastery, flat bonuses come from mindscape effects only
    // (there are no flat Anomaly Mastery substats or W-Engine bonuses)
    const flatAnomalyMasteryBonuses = stats.anomalyMastery - baseAnomalyMastery;

    // Apply ZZZ formula: Final = (Base × (1 + %)) + Flat Bonuses
    // Base for HP/DEF = Agent base only
    // Base for ATK = Agent base + W-Engine base

    // Special handling for HP: Some agents (Zhao, Manato) have HP% ascension bonuses
    // For these agents, baseHP already includes the ascension bonus (naked HP for display)
    // But HP% bonuses must be calculated from the PRE-ASCENSION base
    // Formula: nakedHP + (preAscensionBase × HP%) + flatHP
    if (agent.hasHPAscension && agent.hpAscensionPercent) {
      // baseHP is the naked HP (with ascension included)
      // Calculate pre-ascension base for HP% multiplication
      const preAscensionBase = baseHP / (1 + agent.hpAscensionPercent / 100);
      const hpFromPercent = preAscensionBase * (stats.hppercent / 100);
      stats.hp = baseHP + hpFromPercent + flatHPFromDiscs;
    } else {
      stats.hp = baseHP * (1 + stats.hppercent / 100) + flatHPFromDiscs;
    }
    stats.atk = (baseATK + wEngineBaseATK) * (1 + stats.atkpercent / 100) + flatATKFromDiscs;
    stats.def = baseDEF * (1 + stats.defpercent / 100) + flatDEFFromDiscs;

    // Apply Anomaly Mastery percentage formula:
    // Final = Base × (1 + Anomaly Mastery%) + Flat Bonuses
    // Percentage sources: Disc 6 main stat (30%), Set bonuses (e.g., Phaethon 2pc 8%)
    // Flat sources: Mindscape effects
    stats.anomalyMastery = baseAnomalyMastery * (1 + stats.anomalyMasteryPercent / 100) + flatAnomalyMasteryBonuses;
  }

  /**
   * Apply 4pc effect stat bonuses from equipment data
   * @param setName - Name of the disc set
   * @param stats - Current stats object
   * @param agent - Agent info for specialty checks
   * @param includeConditional - If false, only apply unconditional bonuses
   */
  private apply4pcEffectBonuses(setName: string, stats: BaseStats, agent: Agent, includeConditional: boolean = true): void {
    const equipmentData = this.discSetDataService.getDiscSet(setName);
    if (!equipmentData) {
      return;
    }
    if (!equipmentData['4pcEffect']) {
      return;
    }

    const effect = equipmentData['4pcEffect'];

    // Handle simple format (object with Properties array)
    if (!Array.isArray(effect)) {
      this.applyPropertiesArray(effect.Properties, stats);
    }
    // Handle conditional format (array of effect objects)
    else {
      effect.forEach((effectPart) => {
        // Skip conditional bonuses if includeConditional is false
        if (effectPart.Condition && !includeConditional) {
          return;
        }

        // Only apply if condition is met or no condition exists
        if (!effectPart.Condition || this.evaluateCondition(effectPart.Condition, stats, agent)) {
          this.applyPropertiesArray(effectPart.Properties, stats);
        }
      });
    }
  }

  /**
   * Apply conditional 4pc bonuses AFTER final stats are calculated
   * This ensures conditionals check final stat values (with percentage bonuses applied)
   */
  private applyConditional4pcBonuses(
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

    // Apply ONLY conditional 4pc bonuses
    setCounts.forEach((count, setName) => {
      if (count >= 4) {
        const equipmentData = this.discSetDataService.getDiscSet(setName);
        if (!equipmentData || !equipmentData['4pcEffect']) {
          return;
        }

        const effect = equipmentData['4pcEffect'];

        // Only process if it's an array (conditional format)
        if (Array.isArray(effect)) {
          effect.forEach((effectPart) => {
            // Only apply conditional bonuses
            if (effectPart.Condition && this.evaluateCondition(effectPart.Condition, stats, agent)) {
              this.applyPropertiesArray(effectPart.Properties, stats);
            }
          });
        }
      }
    });
  }

  /**
   * Evaluate if a condition is met based on current stats
   */
  private evaluateCondition(
    condition: { Type: string; Stat?: string; Operator?: string; Value: number | string },
    stats: BaseStats,
    agent: Agent
  ): boolean {
    // Handle Specialty condition (e.g., White Water Ballad - Attack specialty)
    if (condition.Type === 'Specialty') {
      return agent.specialty === condition.Value;
    }

    // Handle StatThreshold condition (e.g., King of the Summit - CRIT_RATE >= 50)
    if (condition.Type === 'StatThreshold' && condition.Stat && condition.Operator) {
      // Map condition stat names to BaseStats properties
      const statMapping: { [key: string]: keyof BaseStats } = {
        'Anomaly_Mastery': 'anomalyMastery',
        'Anomaly_Proficiency': 'anomalyProficiency',
        'CRIT_Rate': 'critRate',
        'CRIT_RATE': 'critRate',
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
      const thresholdValue = condition.Value as number;

      switch (condition.Operator) {
        case '>=':
          return currentValue >= thresholdValue;
        case '>':
          return currentValue > thresholdValue;
        case '<=':
          return currentValue <= thresholdValue;
        case '<':
          return currentValue < thresholdValue;
        case '==':
          return currentValue === thresholdValue;
        default:
          console.warn(`Unknown operator in condition: ${condition.Operator}`);
          return false;
      }
    }

    console.warn(`Unknown condition type: ${condition.Type}`);
    return false;
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
          // Set bonus Energy Regen is a percentage bonus
          stats.energyRegenPercent += value;
          break;
        case 'Impact':
          stats.impact += value;
          break;
        case 'Anomaly_Proficiency':
          stats.anomalyProficiency += value;
          break;
        case 'Anomaly_Mastery':
          // Anomaly Mastery from 4pc effects is percentage-based
          stats.anomalyMasteryPercent += value;
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
    // Match patterns like "ATK +10%" or "CRIT Rate +8%" or "Anomaly Mastery +8%"
    const percentMatch = description.match(/(ATK|HP|DEF|CRIT Rate|CRIT DMG|PEN Ratio|Energy Regen|Impact|Anomaly Mastery)\s*\+\s*(\d+(?:\.\d+)?)%/i);
    // Match flat stat patterns like "Anomaly Proficiency +30"
    const flatMatch = description.match(/(Anomaly Proficiency)\s*\+\s*(\d+)/i);

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
          // Parsed Energy Regen from descriptions is a percentage bonus
          stats.energyRegenPercent += numValue;
          break;
        case 'IMPACT':
          stats.impact += numValue;
          break;
        case 'ANOMALY MASTERY':
          // Anomaly Mastery from set bonuses is percentage-based
          stats.anomalyMasteryPercent += numValue;
          break;
      }
    } else if (flatMatch) {
      const [, stat, value] = flatMatch;
      const numValue = parseInt(value);

      if (stat.includes('Proficiency')) {
        stats.anomalyProficiency += numValue;
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
      const equipmentData = this.discSetDataService.getDiscSet(setName);
      if (!equipmentData) return;

      // Only show 2pc bonuses here (4pc bonuses are handled by get4pcEffectBonuses)
      if (count >= 2 && equipmentData.Desc2) {
        activeBonuses.push(`${setName} (2pc): ${equipmentData.Desc2}`);
      }
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
        const equipmentData = this.discSetDataService.getDiscSet(setName);
        if (equipmentData && equipmentData['4pcEffect']) {
          const effect = equipmentData['4pcEffect'];
          // Use a map to consolidate duplicate stats
          const statMap = new Map<string, number>();

          // Handle simple format (unconditional)
          if (!Array.isArray(effect)) {
            effect.Properties.forEach(prop => {
              // Use the Format field to determine if this is a percentage stat
              // Format contains '%' for percentage stats (e.g., "2800" with Format "%" → 28%)
              const isPercentage = prop.Format && prop.Format.includes('%');
              const value = isPercentage ? prop.Value / 100 : prop.Value;
              const formattedStatName = prop.Name2.replace(/_/g, ' ');

              // Add to existing value if stat already exists
              const existing = statMap.get(formattedStatName) || 0;
              statMap.set(formattedStatName, existing + value);
            });
          }
          // Handle conditional format
          else {
            effect.forEach(effectPart => {
              // Only include stats if there's no condition OR condition is met
              if (!effectPart.Condition || this.evaluateCondition(effectPart.Condition, currentStats, agent)) {
                effectPart.Properties.forEach(prop => {
                  // Use the Format field to determine if this is a percentage stat
                  // Format contains '%' for percentage stats (e.g., "2800" with Format "%" → 28%)
                  const isPercentage = prop.Format && prop.Format.includes('%');
                  const value = isPercentage ? prop.Value / 100 : prop.Value;
                  const formattedStatName = prop.Name2.replace(/_/g, ' ');

                  // Add to existing value if stat already exists
                  const existing = statMap.get(formattedStatName) || 0;
                  statMap.set(formattedStatName, existing + value);
                });
              }
            });
          }

          // Convert map to display strings
          const statParts: string[] = [];
          statMap.forEach((value, statName) => {
            // Assume percentage if the stat name contains these keywords or value is small
            const isPercentStat = statName.includes('RATE') || statName.includes('DMG') || statName.includes('%') || value < 100;
            const formattedValue = isPercentStat ? `${value}%` : `${value}`;
            statParts.push(`${statName}: +${formattedValue}`);
          });

          if (statParts.length > 0) {
            active4pcBonuses.push(`${setName} (4pc): ${statParts.join(', ')}`);
          }
        }
      }
    });

    return active4pcBonuses;
  }

}
