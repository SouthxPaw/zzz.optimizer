// services/stat-calculator.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Agent, BaseStats, DiscSlot } from '../models/agent.model';
import { Disc, SubStatType } from '../models/disc.model';
import { WEngine } from '../models/wengine.model';
import { DISC_SETS } from '../constants/disc-sets';
import { DISC_SET_EQUIPMENT_IDS } from '../constants/disc-set-ids';
import { versionedUrl } from '../utils/versioned-url';

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

  // Memoization cache for stat calculations
  private statCache = new Map<string, BaseStats>();
  private readonly CACHE_SIZE_LIMIT = 1000;

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
          this.http.get<DiscSetEquipmentData>(versionedUrl(`assets/data/equipment/${id}.json`))
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
    // Generate cache key
    const cacheKey = this.generateCacheKey(agent.id, level, wEngine?.id, discs, mindscapeLevel, wEngineRefinement);

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

    // Apply set bonuses (this applies percentage bonuses to HP/ATK/DEF)
    this.applySetBonuses(stats, discs, agent, wEngine);

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
    // Create a deterministic key from disc UIDs and their stats
    // Include main stat type/value to invalidate cache when disc is edited
    const discInfo = Object.entries(discs)
      .filter(([_, disc]) => disc !== undefined)
      .map(([slot, disc]) => `${slot}:${disc!.uid}:${disc!.mainStat.type}:${disc!.mainStat.value}`)
      .sort()
      .join('|');

    return `${agentId}:${level}:${wEngineId || 'none'}:${mindscapeLevel}:${wEngineRefinement}:${discInfo}`;
  }

  private addToCache(key: string, stats: BaseStats): void {
    // Simple LRU-like cache: remove oldest entries when limit is reached
    if (this.statCache.size >= this.CACHE_SIZE_LIMIT) {
      const firstKey = this.statCache.keys().next().value;
      if (firstKey) {
        this.statCache.delete(firstKey);
      }
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
          // Refinement Energy Regen bonuses are percentage bonuses
          stats.energyRegenPercent += value;
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
                // Mindscape Energy Regen bonuses are percentage bonuses
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
          // Disc 6 Anomaly Mastery is a percentage bonus (30%)
          stats.anomalyMasteryPercent += mainStat.value;
          break;
        case 'Pen_Ratio':
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
            // Disc substat Energy Regen would be a percentage bonus (though doesn't exist in game)
            stats.energyRegenPercent += subStat.value;
            break;
        }
      });
    });
  }

  private applySetBonuses(
    stats: BaseStats,
    discs: { [key in DiscSlot]?: Disc },
    agent: Agent,
    wEngine: WEngine | null
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
    const wEngineBaseATK = wEngine?.baseAtk || 0;

    const flatHPFromDiscs = stats.hp - baseHP;
    const flatATKFromDiscs = stats.atk - baseATK - wEngineBaseATK;
    const flatDEFFromDiscs = stats.def - baseDEF;

    // For Anomaly Mastery, flat bonuses come from mindscape effects only
    // (there are no flat Anomaly Mastery substats or W-Engine bonuses)
    const flatAnomalyMasteryBonuses = stats.anomalyMastery - baseAnomalyMastery;

    // Apply ZZZ formula: Final = (Base × (1 + %)) + Flat Bonuses
    // Base for HP/DEF = Agent base only
    // Base for ATK = Agent base + W-Engine base
    stats.hp = baseHP * (1 + stats.hppercent / 100) + flatHPFromDiscs;
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
    const percentMatch = description.match(/(ATK|HP|DEF|CRIT Rate|CRIT DMG|PEN Ratio|Energy Regen|Impact|Anomaly Mastery)\s*\+(\d+(?:\.\d+)?)%/i);
    // Match flat stat patterns like "Anomaly Proficiency +30"
    const flatMatch = description.match(/(Anomaly Proficiency)\s*\+(\d+)/i);

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
      const discSet = DISC_SETS.find(s => s.name === setName);
      if (!discSet) return;

      // Only show 2pc bonuses here (4pc bonuses are handled by get4pcEffectBonuses)
      discSet.bonuses.forEach(bonus => {
        if (bonus.pieces === 2 && count >= 2) {
          activeBonuses.push(`${setName} (2pc): ${bonus.description}`);
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
              // If value < 1, it's a decimal percentage that needs to be converted (0.25 → 25%)
              // If value >= 1, it's a flat value (45 → +45, no % sign)
              const isDecimalPercent = prop.Value < 1;

              const value = isDecimalPercent ? prop.Value * 100 : prop.Value;
              const formattedValue = isDecimalPercent ? `${value}%` : value;
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
                  // If value < 1, it's a decimal percentage that needs to be converted (0.25 → 25%)
                  // If value >= 1, it's a flat value (45 → +45, no % sign)
                  const isDecimalPercent = prop.Value < 1;

                  const value = isDecimalPercent ? prop.Value * 100 : prop.Value;
                  const formattedValue = isDecimalPercent ? `${value}%` : value;
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
