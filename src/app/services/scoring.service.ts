import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Disc } from '../models/disc.model';
import { BaseStats, WEngine } from '../models/agent.model';
import {
  DISC_RATING_THRESHOLDS,
  BUILD_RATING_THRESHOLDS,
  EXTERNAL_STAT_WEIGHTS,
  BUILD_SCORE_WEIGHTS,
  BREAKPOINT_PENALTIES,
  DiscRating,
  BuildRating,
  FeedbackItem,
} from '../constants/disc-scoring';
import { UpgradePlan } from '../models/upgrade-plan.model';
import { calculateRollCount } from '../constants/substat-rolls';
import { DiscSetDataService } from './disc-set-data.service';
import {
  estimateDamage,
  calculateStatusDamage,
  calculateSheerForce,
  calculateDazeContribution,
  calculateAnomalyBuildup,
} from '../constants/damage-formulas';
import {
  ENEMY_PROFILES,
  ENEMY_WEIGHTS,
} from '../constants/enemy-profiles';
import {
  getAgentSkillMultiplier,
  getStatusEffectType,
} from '../constants/agent-skills';
import { SkillParserService } from './skill-parser.service';
import { versionedUrl } from '../utils/versioned-url';
import { hasValidationErrors } from '../utils/disc-validation';

interface AgentBreakpoint {
  min: number;
  optimal: number;
}

interface AgentBreakpoints {
  name: string;
  breakpoints: {
    hp: AgentBreakpoint;
    atk: AgentBreakpoint;
    def: AgentBreakpoint;
    impact: AgentBreakpoint;
    anomalyMastery: AgentBreakpoint;
    critRate: AgentBreakpoint;
    critDmg: AgentBreakpoint;
    anomalyProficiency: AgentBreakpoint;
    pen: AgentBreakpoint;
    penRatio: AgentBreakpoint;
    energyRegen: AgentBreakpoint;
  };
  priorityStats: string[];
  statWeights?: { [stat: string]: number };
  mainStatWeights?: { [slot: string]: { [stat: string]: number } };
}

interface DiscSetData {
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
  };
}

interface MindscapeData {
  mindscapes: {
    [agentId: string]: {
      comment?: string;
      [level: number]: Array<{
        type: string;
        value: number;
        note: string;
      }>;
    };
  };
}

@Injectable({
  providedIn: 'root',
})
export class ScoringService {
  private agentBreakpoints: { [agentId: string]: AgentBreakpoints } = {};
  private breakpointsLoaded = false;
  private agentStatWeights: { [agentId: string]: any } = {};
  private mindscapeData: MindscapeData | null = null;

  // OPTIMIZATION: Use shared disc set data service
  constructor(
    private http: HttpClient,
    private skillParserService: SkillParserService,
    private discSetDataService: DiscSetDataService
  ) {
    this.loadAllData();
  }

  /**
   * Load all data needed for scoring
   */
  private async loadAllData() {
    await Promise.all([
      this.loadAgentBreakpoints(),
      this.loadAgentStatWeights(),
      this.discSetDataService.loadDiscSetData(), // OPTIMIZATION: Use shared service
      this.loadMindscapeData(),
      this.loadSkillMultipliers(),
    ]);
  }

  /**
   * Load skill multipliers for damage estimation
   */
  private async loadSkillMultipliers() {
    try {
      // Get all agent IDs from breakpoints
      const agentIds = Object.keys(this.agentBreakpoints);
      if (agentIds.length === 0) {
        // If breakpoints not loaded yet, use common agent IDs
        const commonAgentIds = [
          '1011',
          '1021',
          '1031',
          '1041',
          '1081',
          '1091',
          '1101',
          '1111',
          '1121',
          '1131',
          '1141',
          '1151',
          '1161',
          '1181',
          '1191',
          '1211',
          '1241',
          '1251',
          '1281',
        ];
        await this.skillParserService.loadSkillMultipliers(commonAgentIds);
      } else {
        await this.skillParserService.loadSkillMultipliers(agentIds);
      }
    } catch (error) {
      // Silently ignore - skill multipliers are optional fallback data
      // The app works fine without them
    }
  }

  /**
   * Load agent breakpoints from JSON file
   */
  private async loadAgentBreakpoints() {
    try {
      const data = await firstValueFrom(
        this.http.get<any>(versionedUrl('assets/data/agent-breakpoints.json'))
      );
      this.agentBreakpoints = data.agents || {};
      this.breakpointsLoaded = true;
    } catch (error) {
      console.error('Failed to load agent breakpoints:', error);
    }
  }

  /**
   * Load contextual stat weights from agent stat weights data
   */
  private async loadAgentStatWeights() {
    try {
      const data = await firstValueFrom(
        this.http.get<any>(versionedUrl('assets/data/agent-stat-weights.json'))
      );
      this.agentStatWeights = data.agents || {};
    } catch (error) {
      console.error('Failed to load agent stat weights:', error);
    }
  }

  // OPTIMIZATION: Removed - now using shared DiscSetDataService

  /**
   * Load mindscape stat bonuses
   */
  private async loadMindscapeData() {
    try {
      this.mindscapeData = await firstValueFrom(
        this.http.get<MindscapeData>(versionedUrl('assets/data/mindscape-stats.json'))
      );
    } catch (error) {
      console.error('Failed to load mindscape data:', error);
    }
  }

  /**
   * Calculate breakpoint penalty multiplier
   * Returns a multiplier (0.0-1.0) to apply to score based on missing breakpoints
   *
   * @param currentValue - Actual stat value
   * @param breakpoint - Target breakpoint with min and optimal
   * @returns Penalty multiplier (1.0 = no penalty, 0.7 = 30% penalty)
   */
  private calculateBreakpointPenalty(
    currentValue: number,
    breakpoint: AgentBreakpoint
  ): number {
    // At or above optimal - no penalty
    if (currentValue >= breakpoint.optimal) {
      return 1.0;
    }

    // Below minimum - apply full penalty
    if (currentValue < breakpoint.min) {
      return 1.0 - BREAKPOINT_PENALTIES.MISSING_MIN;
    }

    return 0;
  }

  /**
   * Get aggregated stat weights for a specific agent and build type
   * Returns max weight for each stat across all disc slots
   * Public method for UI components to check which stats are valuable
   */
  getBuildStatWeights(agentId: string, buildType: string): { [stat: string]: number } {
    const buildStatWeights: { [stat: string]: number } = {};

    if (!this.agentStatWeights[agentId]) {
      return buildStatWeights;
    }

    const buildData = this.agentStatWeights[agentId].builds?.[buildType];
    if (!buildData) {
      return buildStatWeights;
    }

    // Standard main stats per slot (exclude edge cases like HP% main on Drive 4)
    const standardMainStats: { [slot: string]: string[] } = {
      'Drive1': ['HP', 'ATK', 'DEF'], // Fixed main stats (all variants)
      'Drive2': ['HP', 'ATK', 'DEF'], // Fixed main stats (all variants)
      'Drive3': ['HP', 'ATK', 'DEF'], // Fixed main stats (all variants)
      'Drive4': ['CRIT_Rate', 'CRIT_DMG', 'ATK%'], // Most common main stats for Drive 4
      'Drive5': ['ATK%', 'PEN_Ratio', 'Element_DMG'], // Most common main stats for Drive 5
      'Drive6': ['Anomaly_Mastery', 'Energy_Regen', 'Impact'], // Most common main stats for Drive 6
    };

    // Aggregate max weight for each stat across STANDARD main stat configurations only
    Object.entries(buildData.contextualWeights || {}).forEach(([slot, slotData]: [string, any]) => {
      const allowedMainStats = standardMainStats[slot] || [];

      Object.entries(slotData || {}).forEach(([mainStat, mainStatData]: [string, any]) => {
        // Only consider standard main stat configurations
        if (allowedMainStats.length === 0 || allowedMainStats.includes(mainStat)) {
          Object.entries(mainStatData.substatWeights || {}).forEach(([stat, weight]) => {
            buildStatWeights[stat] = Math.max(buildStatWeights[stat] || 0, weight as number);
          });
        }
      });
    });

    return buildStatWeights;
  }

  /**
   * Detect build type (CRIT or Anomaly) based on total stats across all 6 discs
   * This determines which weight profile to use for scoring
   * Public method so UI components can also detect build type
   */
  detectBuildType(discs: Disc[], agentId?: string): string {
    if (!agentId || !this.agentStatWeights[agentId]) {
      return 'CRIT'; // Default to CRIT if no agent data
    }

    const availableBuilds = this.agentStatWeights[agentId].builds;
    if (!availableBuilds) {
      return 'CRIT'; // Fallback to CRIT
    }

    // If only one build available, use it
    const buildTypes = Object.keys(availableBuilds);
    if (buildTypes.length === 1) {
      return buildTypes[0];
    }

    // Count total rolls in CRIT stats vs Anomaly stats (substats only)
    let anomalyRolls = 0;
    let critRolls = 0;

    discs.forEach(disc => {
      disc.subStats.forEach(substat => {
        const rolls = calculateRollCount(substat.type, substat.value);

        if (substat.type === 'Anomaly_Proficiency') {
          anomalyRolls += rolls;
        } else if (substat.type === 'CRIT_Rate' || substat.type === 'CRIT_DMG') {
          critRolls += rolls;
        }
        // Note: Anomaly_Mastery is no longer a valid substat (main stat only on Disc 6)
      });
    });

    // Return build type with higher roll count
    return (anomalyRolls > critRolls) ? 'Anomaly' : 'CRIT';
  }

  /**
   * Calculate disc score based on substats and main stat
   * Uses agent-specific weights from breakpoints config
   *
   * NEW ALGORITHM (v2):
   * - Focuses on "where did rolls go" not "what substats exist"
   * - No penalty for substats with 0 rolls
   * - Simple formula: Main Stat (3pts) + Substat Rolls (rolls × weight × 3.0) + Roll Bonus (1pt)
   * - Converts 0-30 normalized scale to 0-140+ scale (multiply by 4.8)
   *
   * BACKWARD COMPATIBLE:
   * - Old agents use priorityStats: ['CRIT_Rate', 'CRIT_DMG'] (all weighted 1.0)
   * - New agents use statWeights: { 'CRIT_Rate': 1.0, 'CRIT_DMG': 0.85 }
   */
  calculateDiscScore(
    disc: Disc,
    agentId?: string,
    buildType?: string,
    upgradePlan?: UpgradePlan  // NEW: Override with user's custom upgrade plan
  ): { score: number; rating: DiscRating; breakdown: any } {
    const breakdown = {
      mainStatPoints: 0,
      subStatPoints: 0,
      rollBonusPoints: 0,
      godRollBonus: 0,
      allGoodBonus: 0,
      normalized_score: 0,
      detectedBuild: null as string | null,
      totalRolls: 0,
      details: [] as Array<{
        stat: string;
        value: number;
        points: number;
        rolls: number;
      }>,
    };

    // STEP 0: Get contextual weights based on main stat and build type
    // If upgradePlan is provided, use it to COMPLETELY REPLACE agent-stat-weights.json logic
    let statWeights: { [stat: string]: number } = {};
    let mainStatPoints = 0;

    if (upgradePlan) {
      // USE UPGRADE PLAN - complete replacement of default weight system
      // Convert user's priority levels to weights
      const priorityToWeight: { [key: string]: number } = {
        'Essential': 1.3,   // Highest priority
        'Important': 1.0,   // Normal priority
        'Nice': 0.7,        // Lower priority
        'Ignore': 0.17      // BLACK tier - wasted stat
      };

      // Get substat priorities for this disc slot
      const slotPriorities = upgradePlan.substatPriorities[disc.slot] || {};

      // Convert priorities to weights
      Object.keys(slotPriorities).forEach(stat => {
        const priority = slotPriorities[stat];
        statWeights[stat] = priorityToWeight[priority] || 0.17; // Default to Ignore if undefined
      });

      // Get main stat points based on user's preferences
      if (disc.slot === 'Drive1' || disc.slot === 'Drive2' || disc.slot === 'Drive3') {
        // Fixed main stat slots always get 3 points
        mainStatPoints = 3;
      } else {
        // Drive 4/5/6: Check user's main stat preferences
        const slotPrefs = upgradePlan.mainStatPreferences[disc.slot as 'Drive4' | 'Drive5' | 'Drive6'];
        if (slotPrefs && slotPrefs[disc.mainStat.type]) {
          mainStatPoints = slotPrefs[disc.mainStat.type] === 'Acceptable' ? 3 : 0;
        } else {
          // Not set by user - default to Acceptable (3 points)
          mainStatPoints = 3;
        }
      }

      breakdown.detectedBuild = 'Custom Plan';
    } else if (agentId && this.agentStatWeights[agentId]) {
      // Use new contextual weight system from agent-stat-weights.json
      const agentData = this.agentStatWeights[agentId];

      // Select the appropriate build (CRIT, Anomaly, or Support)
      // If buildType not provided, default to first available build
      let selectedBuildType = buildType;
      if (!selectedBuildType && agentData.builds) {
        selectedBuildType = Object.keys(agentData.builds)[0] || 'CRIT';
      }

      // Get the build's contextual weights
      const buildWeights = agentData.builds?.[selectedBuildType || 'CRIT'];
      if (buildWeights) {
        const contextualData = buildWeights.contextualWeights?.[disc.slot]?.[disc.mainStat.type];

        if (contextualData) {
          // Found contextual weights for this slot + main stat combination
          mainStatPoints = contextualData.mainStatPoints;
          statWeights = contextualData.substatWeights;
          breakdown.detectedBuild = selectedBuildType || null;
        } else {
          // No contextual data for this main stat - this is an off-meta main stat
          // Award default points for Drive 1-3 (fixed slots), 0 for Drive 4-6
          mainStatPoints = (disc.slot === 'Drive1' || disc.slot === 'Drive2' || disc.slot === 'Drive3') ? 3 : 0;
          statWeights = {}; // No substats will have weights (off-meta build)
        }
      } else {
        // Build type not found, use default points
        mainStatPoints = (disc.slot === 'Drive1' || disc.slot === 'Drive2' || disc.slot === 'Drive3') ? 3 : 0;
        statWeights = {};
      }
    } else {
      // No agent specified or no stat weights data available
      // Use generic scoring: all stats weighted equally at 1.0
      mainStatPoints = 3;
      statWeights = {
        CRIT_Rate: 1.0,
        CRIT_DMG: 1.0,
        'ATK%': 1.0,
        'HP%': 1.0,
        'DEF%': 1.0,
        Anomaly_Proficiency: 1.0,
        Anomaly_Mastery: 1.0,
        Energy_Regen: 1.0,
        Impact: 1.0,
        PEN: 1.0,
        PEN_Ratio: 1.0,
      };
    }

    breakdown.mainStatPoints = mainStatPoints;

    // STEP 2: Substat Points (ONLY count priority stats)
    // Formula: rolls × weight × multiplier per stat
    let substatPoints = 0;
    let totalRollCount = 0;

    // Detect multiplier based on weight range (for backward compatibility)
    const maxWeight = Math.max(...Object.values(statWeights).filter(w => typeof w === 'number'));
    const multiplier = maxWeight > 1.5 ? 1.0 : 3.0;

    disc.subStats.forEach((substat) => {
      // Calculate total roll count for this substat
      const rolls = calculateRollCount(substat.type, substat.value);
      totalRollCount += rolls;
      breakdown.totalRolls += rolls;

      // Get stat weight
      const statWeight = statWeights[substat.type];

      // Only award points for priority stats (weight > 0)
      if (statWeight !== undefined && statWeight > 0) {
        const points = rolls * statWeight * multiplier;
        substatPoints += points;

        breakdown.subStatPoints += points;
        breakdown.details.push({
          stat: `${substat.type} (×${statWeight.toFixed(2)})`,
          value: substat.value,
          points: Math.round(points * 10) / 10,
          rolls: rolls,
        });
      } else {
        // Wasted stat gets minimal points
        const BLACK_TIER_WEIGHT = multiplier === 1.0 ? 0.5 : 0.17;
        const points = rolls * BLACK_TIER_WEIGHT * multiplier;
        substatPoints += points;

        breakdown.subStatPoints += points;
        breakdown.details.push({
          stat: `${substat.type} (wasted)`,
          value: substat.value,
          points: Math.round(points * 10) / 10,
          rolls: rolls,
        });
      }
    });

    // STEP 3: God Roll Concentration Bonus
    // Reward exceptionally high UPGRADE rolls (4-5) in a single priority stat
    // Note: We count UPGRADE rolls only (not including initial roll)
    // Threshold raised to 4+ to make god-roll bonus more exclusive
    //
    // Special case: For Anomaly builds with only 1 Tier-S stat available (e.g., D4 with AP main),
    // provide a graduated bonus to avoid harsh cliff effects between SS and VH tiers
    let godRollBonus = 0;
    let godRollStat = '';

    // Count how many Tier-S stats (weight >= 1.0) exist in the weights
    const tierSStatsAvailable = Object.values(statWeights).filter(w => w >= 1.0).length;

    disc.subStats.forEach((substat) => {
      const totalRolls = calculateRollCount(substat.type, substat.value);
      const upgradeRolls = totalRolls - 1; // Subtract initial roll
      const weight = statWeights[substat.type] || 0;

      // Only apply to priority stats (weight >= 1.0)
      if (weight >= 1.0) {
        let bonus = 0;
        if (upgradeRolls >= 5) {
          bonus = 15; // Maxed stat (5 upgrade rolls) - perfect
        } else if (upgradeRolls >= 4) {
          bonus = 11; // 4 upgrade rolls - true god-roll
        } else if (upgradeRolls >= 3 && tierSStatsAvailable === 1) {
          // Special case: If only 1 Tier-S stat available (e.g., D4 AP main for Anomaly),
          // give partial credit for 3 upgrade rolls to avoid harsh cliff from SS to VH
          // This helps discs that got 75% of possible upgrades into the right stat
          bonus = 9; // Partial god-roll - bridges the gap to PHT tier
        }
        // Standard case: upgradeRolls < 3 gets no bonus (balanced rolls already rewarded by base system)

        if (bonus > godRollBonus) {
          godRollBonus = bonus;
          godRollStat = substat.type;
        }
      }
    });

    if (godRollBonus > 0) {
      breakdown.godRollBonus = godRollBonus;
      breakdown.details.push({
        stat: `God Roll Bonus (${godRollStat})`,
        value: godRollBonus,
        points: godRollBonus,
        rolls: 0,
      });
    }

    // STEP 4: All Good Substats Bonus (Context-Aware)
    // Count priority stats (weight >= 1.0) to determine build type
    const priorityStatCount = Object.values(statWeights).filter(w => w >= 1.0).length;

    let allGoodBonus = 0;
    let qualifiesForBonus = false;

    if (priorityStatCount <= 2) {
      // Anomaly builds (≤2 priority stats): More nuanced evaluation
      // Problem: Anomaly builds have limited useful substats (typically AP, ATK%, Flat ATK)
      // When main stat removes one of these (e.g., D2 has Flat ATK main), only 2 Tier-S stats remain
      // CRIT stats become unavoidable filler, not true "wasted" stats

      const wastedStatCount = disc.subStats.filter((substat) => {
        const weight = statWeights[substat.type] || 0;
        return weight === 0;
      }).length;

      // Check if disc has god-roll concentration (for special exception)
      const hasGodRollConcentration = disc.subStats.some((substat) => {
        const totalRolls = calculateRollCount(substat.type, substat.value);
        const upgradeRolls = totalRolls - 1;
        const weight = statWeights[substat.type] || 0;
        return weight >= 1.0 && upgradeRolls >= 4; // Tier-S stat with 4+ upgrade rolls
      });

      // Count how many Tier-S stats (weight >= 1.0) are present on disc
      const tierSStatsPresent = disc.subStats.filter((substat) => {
        const weight = statWeights[substat.type] || 0;
        return weight >= 1.0;
      }).length;

      // Calculate total upgrade rolls in Tier-S stats
      const tierSUpgradeRolls = disc.subStats.reduce((sum, substat) => {
        const weight = statWeights[substat.type] || 0;
        if (weight >= 1.0) {
          const totalRolls = calculateRollCount(substat.type, substat.value);
          const upgradeRolls = totalRolls - 1; // Subtract initial roll
          return sum + upgradeRolls;
        }
        return sum;
      }, 0);

      // Special case: If disc has god-roll concentration AND has both available Tier-S stats,
      // allow 2 wasted stats (recognizing that with only 2 Tier-S options, filler is unavoidable)
      if (hasGodRollConcentration && tierSStatsPresent >= 2 && tierSUpgradeRolls >= 4 && wastedStatCount === 2) {
        qualifiesForBonus = true;
        allGoodBonus = 5;
      } else if (wastedStatCount === 0) {
        // Perfect Anomaly disc - no wasted stats
        qualifiesForBonus = true;
        allGoodBonus = 5;
      } else if (wastedStatCount === 1) {
        // Good Anomaly disc - 1 wasted stat is acceptable but gets reduced bonus
        qualifiesForBonus = true;
        allGoodBonus = 3;
      }
    } else {
      // CRIT builds (≥3 priority stats): Strict - all substats must be useful (≥ 0.17)
      qualifiesForBonus = disc.subStats.every((substat) => {
        const weight = statWeights[substat.type] || 0;
        return weight >= 0.17;
      });

      if (qualifiesForBonus) {
        allGoodBonus = 5;
      }
    }

    if (qualifiesForBonus) {
      breakdown.allGoodBonus = allGoodBonus;
      breakdown.details.push({
        stat: `All Good Substats Bonus (${priorityStatCount <= 2 ? 'Anomaly' : 'CRIT'} build)`,
        value: allGoodBonus,
        points: allGoodBonus,
        rolls: 0,
      });
    }

    // STEP 5: Total Rolls Bonus (1 point if 5+ UPGRADE rolls, not total rolls)
    // Count upgrade rolls only (enhancements), not initial substat rolls
    const upgradeRolls = totalRollCount - disc.subStats.length;
    let rollBonus = 0;
    if (upgradeRolls >= 5) {
      rollBonus = 1; // Simple +1 bonus for maxed disc (matching old system)
      breakdown.rollBonusPoints = rollBonus;
      breakdown.details.push({
        stat: `Upgrade Rolls Bonus (${upgradeRolls}/5+)`,
        value: upgradeRolls,
        points: rollBonus,
        rolls: totalRollCount,
      });
    }

    // STEP 6: Calculate normalized score (0-30 scale)
    // Add god-roll and all-good bonuses (divide by 4.8 to normalize)
    const normalized_score = mainStatPoints + substatPoints + rollBonus + (godRollBonus / 4.8) + (allGoodBonus / 4.8);
    breakdown.normalized_score = Math.round(normalized_score * 10) / 10;

    // STEP 7: Convert to our 0-140+ scale (multiply by 4.8)
    // Use the already-rounded normalized_score to ensure consistency
    const finalScore = breakdown.normalized_score * 4.8;

    // Round the score first
    const roundedScore = Math.round(finalScore * 10) / 10;

    breakdown.details.push({
      stat: 'Normalized Score (0-30 scale)',
      value: breakdown.normalized_score,
      points: roundedScore,
      rolls: breakdown.totalRolls,
    });

    // Determine rating based on ROUNDED score (not raw score)
    const rating = this.getDiscRating(roundedScore);

    return {
      score: roundedScore,
      rating: rating,
      breakdown: breakdown,
    };
  }

  /**
   * Get disc rating based on total points
   */
  private getDiscRating(points: number): DiscRating {
    // Find the highest rating threshold that the points meet
    for (const threshold of DISC_RATING_THRESHOLDS) {
      if (points >= threshold.minPoints) {
        return threshold;
      }
    }
    // Default to F if no threshold is met
    return DISC_RATING_THRESHOLDS[DISC_RATING_THRESHOLDS.length - 1];
  }

  /**
   * Calculate build score based on stat breakpoints
   * Compares build stats against agent-specific optimal targets
   *
   * @param agentId - Agent ID
   * @param stats - Character stats
   * @param buildType - Optional build type (CRIT, Anomaly, Support) for priority stat detection
   */
  calculateBuildScore(
    agentId: string,
    stats: BaseStats,
    buildType?: string
  ): { score: number; rating: BuildRating; breakdown: any } {
    const breakpoints = this.agentBreakpoints[agentId];

    if (!breakpoints) {
      // No breakpoints defined for this agent yet
      return {
        score: 0,
        rating: BUILD_RATING_THRESHOLDS[BUILD_RATING_THRESHOLDS.length - 1],
        breakdown: { message: 'No breakpoints defined for this agent' },
      };
    }

    const breakdown = {
      totalBreakpoints: 0,
      metBreakpoints: 0,
      statDetails: [] as Array<{
        stat: string;
        current: number;
        min: number;
        optimal: number;
        metMin: boolean;
        metOptimal: boolean;
        isPriority: boolean;
      }>,
    };

    // Map BaseStats to breakpoint keys
    const statMapping: { [key: string]: number } = {
      hp: stats.hp,
      atk: stats.atk,
      def: stats.def,
      impact: stats.impact,
      anomalyMastery: stats.anomalyMastery,
      critRate: stats.critRate,
      critDmg: stats.critDmg,
      anomalyProficiency: stats.anomalyProficiency,
      pen: stats.pen,
      penRatio: stats.penRatio,
      energyRegen: stats.energyRegen,
    };

    let totalPenaltyMultiplier = 1.0; // Start with no penalty
    const penaltyDetails: Array<{ stat: string; penalty: number }> = [];

    // Check each breakpoint with diminishing returns and penalties
    Object.keys(breakpoints.breakpoints).forEach((statKey) => {
      const breakpoint =
        breakpoints.breakpoints[
          statKey as keyof typeof breakpoints.breakpoints
        ];
      const rawValue = statMapping[statKey] || 0;
      const isPriority = this.isPriorityStat(statKey, agentId, buildType, breakpoints);

      // Only count breakpoints where optimal > 0 (meaning this stat matters)
      if (breakpoint.optimal > 0) {
        breakdown.totalBreakpoints++;

        // Use raw value - no diminishing returns needed
        // The penalty system already handles missing breakpoints
        // Stats above optimal continue to contribute at full value
        const adjustedValue = rawValue;

        const metMin = adjustedValue >= breakpoint.min;
        const metOptimal = adjustedValue >= breakpoint.optimal;


        // Calculate breakpoint penalty for this stat
        const penaltyMultiplier = this.calculateBreakpointPenalty(
          adjustedValue,
          breakpoint
        );
        if (penaltyMultiplier < 1.0 && isPriority) {
          // Only apply penalty multiplier to priority stats (more strict)
          totalPenaltyMultiplier *= penaltyMultiplier;
          penaltyDetails.push({
            stat: statKey,
            penalty: (1.0 - penaltyMultiplier) * 100, // Convert to percentage
          });
        }


        // Award points based on meeting breakpoints with progressive scoring
        // This gives partial credit for being between min and optimal
        let points = 0;

        if (adjustedValue >= breakpoint.optimal) {
          // Met optimal - full points
          points = isPriority ? 1.5 : 1.0;
        } else if (adjustedValue >= breakpoint.min) {
          // Between min and optimal - progressive scaling
          // Calculate how far between min and optimal (0.0 to 1.0)
          const range = breakpoint.optimal - breakpoint.min;
          const progress =
            range > 0 ? (adjustedValue - breakpoint.min) / range : 0;

          // Scale from 50% to 100% of full points based on progress
          // This ensures meeting min gives you 50% credit, and you get more as you approach optimal
          const scaleFactor = 0.5 + progress * 0.5; // 0.5 to 1.0
          points = (isPriority ? 1.5 : 1.0) * scaleFactor;
        } else {
          // Below min - small credit for having ANY value in priority stats
          if (isPriority && adjustedValue > 0) {
            // Give up to 25% credit for priority stats even below min
            const percentOfMin = Math.min(adjustedValue / breakpoint.min, 1.0);
            points = (isPriority ? 1.5 : 1.0) * 0.25 * percentOfMin;
          }
        }


        breakdown.metBreakpoints += points;

        breakdown.statDetails.push({
          stat: statKey,
          current: rawValue,
          min: breakpoint.min,
          optimal: breakpoint.optimal,
          metMin: metMin,
          metOptimal: metOptimal,
          isPriority: isPriority,
        });
      }
    });

    // Calculate percentage of breakpoints met
    let breakpointsMetPercentage =
      breakdown.totalBreakpoints > 0
        ? (breakdown.metBreakpoints / breakdown.totalBreakpoints) * 100
        : 0;

    // Apply accumulated breakpoint penalties to final score
    breakpointsMetPercentage *= totalPenaltyMultiplier;


    // Determine rating based on percentage
    const rating = this.getBuildRating(breakpointsMetPercentage);


    return {
      score: Math.round(breakpointsMetPercentage * 10) / 10,
      rating: rating,
      breakdown: {
        ...breakdown,
        penaltyMultiplier: Math.round(totalPenaltyMultiplier * 1000) / 1000,
        penalties: penaltyDetails,
      },
    };
  }

  /**
   * Get build rating based on breakpoints met percentage
   */
  private getBuildRating(percentage: number): BuildRating {
    // Find the highest rating threshold that the percentage meets
    for (const threshold of BUILD_RATING_THRESHOLDS) {
      if (percentage >= threshold.breakpointsMetPercentage) {
        return threshold;
      }
    }
    // Default to F if no threshold is met
    return BUILD_RATING_THRESHOLDS[BUILD_RATING_THRESHOLDS.length - 1];
  }

  /**
   * Estimate damage output for a build
   * Returns estimated damage per hit for Attack/Crit agents,
   * status damage for Anomaly agents, Sheer Force for Rupture agents,
   * or Daze contribution for Stun agents.
   *
   * @param stats - Character stats
   * @param agentName - Name of the agent (for skill multiplier)
   * @param agentRole - Role of the agent (Attack, Anomaly, Rupture, Stun, Support, Defense)
   * @param agentElement - Element of the agent (for status effect type)
   * @param elementalDMGBonus - Elemental DMG% from discs/buffs
   * @param agentScoring - Agent's scoring buffs/debuffs from agents.json
   * @param wengineScoring - W-Engine's scoring buffs/debuffs from wengines.json
   * @param HP - Character's HP (needed for Rupture Sheer Force calculation)
   * @param impact - Character's Impact stat (needed for Stun daze calculation)
   * @returns Damage estimation object
   */
  estimateBuildDamage(
    stats: {
      ATK: number;
      HP?: number;
      critRate: number;
      critDMG: number;
      penRatio?: number;
      flatPEN?: number;
      anomalyProficiency?: number;
      anomalyMastery?: number;
      impact?: number;
      level?: number;
    },
    agentId: string,
    agentName: string,
    agentRole: string,
    agentElement: string,
    elementalDMGBonus: number = 0,
    agentScoring?: { buffs: any[]; debuffs: any[]; dazeBonus: number },
    wengineScoring?: { buffs: any[]; debuffs: any[]; dazeBonus: number }
  ): {
    directDamage: number;
    statusDamage?: number;
    sheerForceDamage?: number;
    dazeContribution?: number;
    totalDamage: number;
    damageType: string;
  } {
    // Get skill multiplier for this agent (from parsed JSON or fallback)
    let skillMultiplier = this.skillParserService.getAgentMultiplier(agentId);

    // If skill parser didn't find it, use fallback
    if (!skillMultiplier || skillMultiplier === 2.5) {
      skillMultiplier = getAgentSkillMultiplier(agentName);
    }

    // Common damage bonuses (elemental DMG%, etc.)
    const dmgBonuses = elementalDMGBonus > 0 ? [elementalDMGBonus] : [];

    // Apply scoring buffs from Agent and W-Engine
    let defShred = 0;
    let resShred = 0;
    let damageTaken = 0;
    let stunDMGMult = 0;
    let dazeBonus = 0;

    // Combine agent and w-engine scoring
    const allScoringData = [agentScoring, wengineScoring].filter(Boolean);

    allScoringData.forEach((scoring) => {
      if (!scoring) return;

      // Apply buffs (DMG bonuses, stat bonuses, etc.)
      if (scoring.buffs) {
        scoring.buffs.forEach((buff: any) => {
          const value = parseFloat(buff.value) / 100; // Convert % to decimal

          switch (buff.type) {
            case 'DMGBonus':
            case 'ElementDMG':
              dmgBonuses.push(value);
              break;
            case 'SheerForceBonus':
              if (agentRole === 'Rupture') {
                dmgBonuses.push(value);
              }
              break;
            case 'ATKBonus':
              // ATK% buffs are already in stats, don't double-apply
              break;
            case 'CRITRateBonus':
            case 'CRITDMGBonus':
              // CRIT buffs are already in stats, don't double-apply
              break;
          }
        });
      }

      // Apply debuffs (enemy-affecting modifiers)
      if (scoring.debuffs) {
        scoring.debuffs.forEach((debuff: any) => {
          const value = parseFloat(debuff.value) / 100; // Convert % to decimal

          switch (debuff.type) {
            case 'DEFShred':
              defShred += value;
              break;
            case 'RESShred':
              resShred += value;
              break;
            case 'DamageTaken':
              damageTaken += value;
              break;
            case 'StunDMGMult':
              stunDMGMult += value;
              break;
          }
        });
      }

      // Apply daze bonuses
      if (scoring.dazeBonus) {
        dazeBonus += scoring.dazeBonus;
      }
    });

    // Calculate weighted average damage across all enemy types
    let weightedDirectDamage = 0;
    let weightedStatusDamage = 0;
    let weightedSheerForceDamage = 0;
    let weightedDazeContribution = 0;
    let damageType = 'direct';

    // Calculate damage against each enemy type
    for (const enemy of ENEMY_PROFILES) {
      const weight = ENEMY_WEIGHTS[enemy.name as keyof typeof ENEMY_WEIGHTS];
      let directDamage = 0;
      let statusDamage = 0;
      let sheerForceDamage = 0;
      let dazeContribution = 0;

      // Role-specific damage calculations
      switch (agentRole) {
        case 'Rupture':
          // Rupture agents use Sheer Force - ignores DEF entirely
          // Formula: (ATK × 0.30) + (HP × 0.10)
          damageType = 'sheer_force';
          sheerForceDamage = calculateSheerForce(
            stats.ATK,
            stats.HP || 0,
            dmgBonuses
          );
          break;

        case 'Anomaly':
          // Anomaly agents focus on status effect damage
          // Their effectiveness depends on both damage per proc and buildup rate
          damageType = 'status';
          const statusType = getStatusEffectType(agentElement);

          // Special case for Miyabi: She's a hybrid Anomaly/CRIT agent
          // Her Frostburn damage scales with both Anomaly Proficiency AND CRIT stats
          if (agentId === '1091' || agentName === 'Miyabi') {
            // Calculate both status damage and crit-scaled direct damage
            const baseStatusDamagePerProc = calculateStatusDamage(
              statusType,
              stats.ATK,
              dmgBonuses,
              resShred,
              enemy.res
            );

            // Calculate anomaly buildup rate
            const baseAnomalyBuildup = 1.0;
            const anomalyProficiency = (stats.anomalyProficiency || 0) / 100;
            const buildupRate = calculateAnomalyBuildup(baseAnomalyBuildup, anomalyProficiency);

            // Status damage scaled by buildup rate
            statusDamage = baseStatusDamagePerProc * buildupRate;

            // Also calculate CRIT-based damage (she benefits from both)
            directDamage = estimateDamage(
              {
                ATK: stats.ATK,
                critRate: stats.critRate / 100,
                critDMG: stats.critDMG / 100,
                penRatio: (stats.penRatio || 0) / 100,
                flatPEN: stats.flatPEN || 0,
              },
              skillMultiplier,
              dmgBonuses,
              defShred,
              resShred,
              enemy.def,
              enemy.res
            );

            // Miyabi's damage is a mix of both types
            damageType = 'hybrid';
          } else {
            // Standard anomaly agent calculation
            // Calculate base status damage per proc
            const baseStatusDamagePerProc = calculateStatusDamage(
              statusType,
              stats.ATK,
              dmgBonuses,
              resShred,
              enemy.res
            );

            // Calculate anomaly buildup rate
            const baseAnomalyBuildup = 1.0;
            const anomalyProficiency = (stats.anomalyProficiency || 0) / 100;
            const buildupRate = calculateAnomalyBuildup(baseAnomalyBuildup, anomalyProficiency);

            // Higher buildup rate = more frequent procs = more total damage
            statusDamage = baseStatusDamagePerProc * buildupRate;
          }
          break;

        case 'Stun':
          // Stun agents focus on Daze contribution
          // Also calculate some direct damage as they do moderate damage
          damageType = 'daze';
          dazeContribution = calculateDazeContribution(
            1.0 * (1 + dazeBonus), // Apply daze bonus from agent/w-engine scoring
            stats.impact || 0,
            enemy.dazeGauge
          );
          // Stun agents also deal direct damage
          directDamage = estimateDamage(
            {
              ATK: stats.ATK,
              critRate: stats.critRate / 100,
              critDMG: stats.critDMG / 100,
              penRatio: (stats.penRatio || 0) / 100,
              flatPEN: stats.flatPEN || 0,
            },
            skillMultiplier,
            dmgBonuses,
            defShred,
            resShred,
            enemy.def,
            enemy.res
          );
          break;

        case 'Attack':
          // Attack agents focus on direct CRIT damage
          damageType = 'direct';
          directDamage = estimateDamage(
            {
              ATK: stats.ATK,
              critRate: stats.critRate / 100,
              critDMG: stats.critDMG / 100,
              penRatio: (stats.penRatio || 0) / 100,
              flatPEN: stats.flatPEN || 0,
            },
            skillMultiplier,
            dmgBonuses,
            defShred,
            resShred,
            enemy.def,
            enemy.res
          );
          break;

        case 'Support':
        case 'Defense':
        default:
          // Support/Defense agents do lower direct damage
          damageType = 'direct';
          directDamage = estimateDamage(
            {
              ATK: stats.ATK,
              critRate: stats.critRate / 100,
              critDMG: stats.critDMG / 100,
              penRatio: (stats.penRatio || 0) / 100,
              flatPEN: stats.flatPEN || 0,
            },
            skillMultiplier,
            dmgBonuses,
            defShred,
            resShred,
            enemy.def,
            enemy.res
          );
          break;
      }

      // Apply DamageTaken multiplier from agent/w-engine scoring (final multiplier)
      if (damageTaken > 0) {
        directDamage *= (1 + damageTaken);
        if (statusDamage > 0) statusDamage *= (1 + damageTaken);
        if (sheerForceDamage > 0) sheerForceDamage *= (1 + damageTaken);
      }

      // Accumulate weighted damage
      weightedDirectDamage += directDamage * weight;
      weightedStatusDamage += statusDamage * weight;
      weightedSheerForceDamage += sheerForceDamage * weight;
      weightedDazeContribution += dazeContribution * weight;
    }

    // Calculate total damage based on damage type
    let totalDamage = 0;
    if (weightedSheerForceDamage > 0) {
      totalDamage = weightedSheerForceDamage;
    } else if (weightedDazeContribution > 0) {
      // For Stun, use direct damage but also track daze
      totalDamage = weightedDirectDamage;
    } else {
      totalDamage = weightedDirectDamage + weightedStatusDamage;
    }

    return {
      directDamage: Math.round(weightedDirectDamage),
      statusDamage: weightedStatusDamage > 0 ? Math.round(weightedStatusDamage) : undefined,
      sheerForceDamage: weightedSheerForceDamage > 0 ? Math.round(weightedSheerForceDamage) : undefined,
      dazeContribution: weightedDazeContribution > 0 ? Math.round(weightedDazeContribution * 100) / 100 : undefined,
      totalDamage: Math.round(totalDamage),
      damageType: damageType,
    };
  }

  /**
   * Normalize damage output to 0-100 scale
   * Uses role-specific benchmarks where ALL roles can hit 100
   *
   * @param damage - Total damage value
   * @param role - Agent role
   * @param dazeContribution - Optional daze value for Stun agents
   * @returns Normalized score (0-100)
   */
  private normalizeDamageScore(
    damage: number,
    role: string,
    dazeContribution?: number
  ): number {
    // Role-specific benchmarks calibrated so all roles can hit 100
    // These are based on "optimal build" expectations per role
    const DAMAGE_BENCHMARKS: { [key: string]: number } = {
      Attack: 50000,    // High burst damage per hit
      Anomaly: 45000,   // Status effect damage (per proc)
      Rupture: 50000,   // Sheer Force damage (ignores DEF but lower multiplier)
      Stun: 30000,      // Moderate direct damage
      Support: 15000,   // Lower expected damage (they contribute buffs instead)
      Defense: 20000,   // Low-moderate damage
    };

    // For Stun agents, also factor in Daze contribution
    // Daze is normalized separately (0-1 scale where 1 = full gauge break)
    if (role === 'Stun' && dazeContribution !== undefined) {
      const damageBenchmark = DAMAGE_BENCHMARKS[role] || 30000;
      const damageScore = (damage / damageBenchmark) * 50; // 50% from damage

      // Daze score: 1.0 = breaks full gauge = perfect
      // Typical good stun agent hits ~0.5-0.8 per rotation
      const dazeScore = Math.min(dazeContribution / 0.8, 1.0) * 50; // 50% from daze

      return Math.min(100, damageScore + dazeScore);
    }

    const benchmark = DAMAGE_BENCHMARKS[role] || 40000;
    const normalized = (damage / benchmark) * 100;

    return Math.min(100, normalized); // Cap at 100
  }

  /**
   * Check if agent breakpoints are loaded
   */
  areBreakpointsLoaded(): boolean {
    return this.breakpointsLoaded;
  }

  /**
   * Get agent breakpoints for display
   */
  getAgentBreakpoints(agentId: string): AgentBreakpoints | undefined {
    return this.agentBreakpoints[agentId];
  }

  /**
   * Calculate disc quality score (average of all equipped discs)
   * Component 2 of composite build rating (30% weight)
   */
  private calculateDiscQualityScore(
    equippedDiscs: Disc[],
    agentId: string,
    upgradePlan?: UpgradePlan  // NEW: Use upgrade plan if provided
  ): number {
    if (!equippedDiscs || equippedDiscs.length === 0) {
      return 0;
    }

    // Detect build type based on total stats across all 6 discs
    // This determines which weight profile (CRIT, Anomaly, or Support) to use
    // NOTE: If upgrade plan is provided, this detection is not used
    const detectedBuildType = upgradePlan ? undefined : this.detectBuildType(equippedDiscs, agentId);

    // Convert disc ratings to numeric scores
    const ratingToScore: { [key: string]: number } = {
      'VH': 110,  // Top 3% globally - exceeds perfection
      'PHT': 105,    // Top 5% - near-perfect
      SSS: 100,            // Top 10% - perfect
      SS: 90,
      S: 80,
      A: 70,
      B: 60,
      C: 50,
      D: 40,
      F: 30,
    };

    let totalScore = 0;
    equippedDiscs.forEach((disc) => {
      // Score each disc using the detected build type OR upgrade plan
      const result = this.calculateDiscScore(disc, agentId, detectedBuildType, upgradePlan);
      totalScore += ratingToScore[result.rating.grade] || 0;
    });

    // Return average score as percentage (0-100)
    // IMPORTANT: Always divide by 6 (total disc slots), not by number of equipped discs
    // This ensures missing discs properly penalize the score
    return totalScore / 6;
  }

  /**
   * Calculate stat efficiency score
   * Component 3 of composite build rating (15% weight)
   * Rewards balanced stat allocation and penalizes wasted investment
   * Evaluates how well stats are distributed across priority vs non-priority stats
   *
   * @param stats - Character stats
   * @param breakpoints - Agent breakpoints configuration
   * @param agentId - Agent ID for detecting build-specific priority stats
   * @param detectedBuildType - Build type (CRIT, Anomaly, Support) for contextual stat priorities
   */
  private calculateStatEfficiencyScore(
    stats: BaseStats,
    breakpoints: AgentBreakpoints,
    agentId?: string,
    detectedBuildType?: string
  ): number {
    let efficiencyScore = 50; // Start at 50 (neutral)

    const statMapping: { [key: string]: number } = {
      hp: stats.hp,
      atk: stats.atk,
      def: stats.def,
      impact: stats.impact,
      anomalyMastery: stats.anomalyMastery,
      critRate: stats.critRate,
      critDmg: stats.critDmg,
      anomalyProficiency: stats.anomalyProficiency,
      pen: stats.pen,
      penRatio: stats.penRatio,
      energyRegen: stats.energyRegen,
    };

    // Use build-specific stat weights if available (for agents with multiple builds)
    // This allows efficiency scoring to adapt based on detected build type (CRIT, Anomaly, Support)
    let buildSpecificStatWeights: { [stat: string]: number } = {};
    if (agentId && detectedBuildType && this.agentStatWeights[agentId]) {
      const buildData = this.agentStatWeights[agentId].builds?.[detectedBuildType];
      if (buildData) {
        // Aggregate max weight for each stat across all disc slots/main stats
        Object.values(buildData.contextualWeights || {}).forEach((slotData: any) => {
          Object.values(slotData || {}).forEach((mainStatData: any) => {
            Object.entries(mainStatData.substatWeights || {}).forEach(([stat, weight]) => {
              buildSpecificStatWeights[stat] = Math.max(buildSpecificStatWeights[stat] || 0, weight as number);
            });
          });
        });
      }
    }

    let totalPriorityStatValue = 0;
    let totalNonPriorityStatValue = 0;
    let totalPriorityOptimal = 0;

    Object.keys(breakpoints.breakpoints).forEach((statKey) => {
      const breakpoint =
        breakpoints.breakpoints[
          statKey as keyof typeof breakpoints.breakpoints
        ];
      const currentValue = statMapping[statKey] || 0;

      // Check if stat is priority using build-specific weights if available
      let isPriority = false;
      if (Object.keys(buildSpecificStatWeights).length > 0) {
        // Use build-specific weights from agent-stat-weights.json
        const statTypeMap: { [key: string]: string[] } = {
          critRate: ['CRIT_Rate'],
          critDmg: ['CRIT_DMG'],
          atk: ['ATK%', 'ATK'],
          hp: ['HP%', 'HP'],
          def: ['DEF%', 'DEF'],
          anomalyProficiency: ['Anomaly_Proficiency'],
          anomalyMastery: ['Anomaly_Mastery'],
          pen: ['PEN'],
          penRatio: ['PEN_Ratio'],
          impact: ['Impact'],
          energyRegen: ['Energy_Regen'],
        };
        const possibleStatNames = statTypeMap[statKey] || [];
        isPriority = possibleStatNames.some(
          (statName) => (buildSpecificStatWeights[statName] || 0) >= 1.0
        );
      } else {
        // Fallback to original logic using breakpoints
        isPriority = this.isPriorityStat(statKey, agentId, detectedBuildType, breakpoints);
      }

      if (isPriority && breakpoint.optimal > 0) {
        totalPriorityStatValue += currentValue;
        totalPriorityOptimal += breakpoint.optimal;

        // Reward exceeding optimal with diminishing returns
        if (currentValue > breakpoint.optimal) {
          const excessPercentage =
            ((currentValue - breakpoint.optimal) / breakpoint.optimal) * 100;
          // Diminishing returns: first 10% excess = +3 points, next 10% = +2, next 10% = +1
          if (excessPercentage <= 10) {
            efficiencyScore += excessPercentage * 0.3;
          } else if (excessPercentage <= 20) {
            efficiencyScore += 3 + (excessPercentage - 10) * 0.2;
          } else {
            efficiencyScore += 3 + 2 + (excessPercentage - 20) * 0.1;
          }
        }
      } else if (!isPriority && breakpoint.optimal === 0 && currentValue > 0) {
        // Penalize investment in non-priority stats (e.g., DEF% on DPS, ATK% on support)
        totalNonPriorityStatValue += currentValue;
      }
    });

    // Calculate allocation efficiency ratio
    // Good builds invest heavily in priority stats, minimally in non-priority
    if (totalPriorityOptimal > 0) {
      const priorityRatio = Math.min(1, totalPriorityStatValue / totalPriorityOptimal);

      // Reward high priority stat coverage (up to +20 points)
      efficiencyScore += priorityRatio * 20;

      // Penalize wasted investment in non-priority stats
      if (totalNonPriorityStatValue > 0) {
        const wasteRatio = totalNonPriorityStatValue / totalPriorityOptimal;
        // Penalty scales with how much was wasted (up to -15 points)
        efficiencyScore -= Math.min(15, wasteRatio * 30);
      }
    }

    // Bonus for balanced priority stat distribution (not all eggs in one basket)
    // This rewards spreading priority stats rather than hyper-investing in just one
    // BUT: Only apply this bonus if the agent has enough priority stats to spread across

    // Helper to check if stat is priority (reuse logic from above)
    const isStatPriority = (statKey: string): boolean => {
      if (Object.keys(buildSpecificStatWeights).length > 0) {
        const statTypeMap: { [key: string]: string[] } = {
          critRate: ['CRIT_Rate'],
          critDmg: ['CRIT_DMG'],
          atk: ['ATK%', 'ATK'],
          hp: ['HP%', 'HP'],
          def: ['DEF%', 'DEF'],
          anomalyProficiency: ['Anomaly_Proficiency'],
          anomalyMastery: ['Anomaly_Mastery'],
          pen: ['PEN'],
          penRatio: ['PEN_Ratio'],
          impact: ['Impact'],
          energyRegen: ['Energy_Regen'],
        };
        const possibleStatNames = statTypeMap[statKey] || [];
        return possibleStatNames.some(
          (statName) => (buildSpecificStatWeights[statName] || 0) >= 1.0
        );
      } else {
        return this.isPriorityStat(statKey, agentId, detectedBuildType, breakpoints);
      }
    };

    // Count total priority stats available for this agent
    const totalPriorityStats = Object.keys(breakpoints.breakpoints).filter((statKey) => {
      const breakpoint = breakpoints.breakpoints[statKey as keyof typeof breakpoints.breakpoints];
      const isPriority = isStatPriority(statKey);
      return isPriority && breakpoint.optimal > 0;
    }).length;

    // Count how many priority stats are currently met (above min)
    const priorityStatCount = Object.keys(breakpoints.breakpoints).filter((statKey) => {
      const breakpoint = breakpoints.breakpoints[statKey as keyof typeof breakpoints.breakpoints];
      const isPriority = isStatPriority(statKey);
      const currentValue = statMapping[statKey] || 0;
      return isPriority && breakpoint.optimal > 0 && currentValue > breakpoint.min;
    }).length;

    // Only apply balanced distribution bonus if agent has 4+ priority stats
    // Anomaly agents (2-3 priority stats) and Support agents (2-3 stats) skip this bonus
    if (totalPriorityStats >= 4) {
      if (priorityStatCount >= 3) {
        efficiencyScore += 10; // Bonus for meeting 3+ priority stats
      } else if (priorityStatCount >= 2) {
        efficiencyScore += 5; // Smaller bonus for 2 priority stats
      }
    } else {
      // For agents with 2-3 priority stats, give bonus if they meet most of them
      if (priorityStatCount >= totalPriorityStats - 1) {
        efficiencyScore += 10; // Meeting all or all-but-one priority stats
      } else if (priorityStatCount >= 1) {
        efficiencyScore += 5; // Meeting at least 1 priority stat
      }
    }

    // Clamp between 0-100
    return Math.max(0, Math.min(100, efficiencyScore));
  }

  /**
   * Check if a stat is a priority stat for the agent
   * Uses agent-stat-weights.json for accurate, build-specific priority detection
   *
   * @param statKey - Breakpoint stat key (e.g., 'critRate', 'anomalyProficiency')
   * @param agentId - Agent ID for loading stat weights
   * @param buildType - Build type (CRIT, Anomaly, Support) for contextual priorities
   * @param breakpoints - Agent breakpoints (used only as fallback for legacy data)
   * @returns true if the stat is a priority stat (weight >= 1.0)
   */
  private isPriorityStat(
    statKey: string,
    agentId?: string,
    buildType?: string,
    breakpoints?: AgentBreakpoints
  ): boolean {
    // Map breakpoint key to stat type name for checking weights
    const statTypeMap: { [key: string]: string[] } = {
      critRate: ['CRIT_Rate'],
      critDmg: ['CRIT_DMG'],
      atk: ['ATK%', 'ATK'],
      hp: ['HP%', 'HP'],
      def: ['DEF%', 'DEF'],
      anomalyProficiency: ['Anomaly_Proficiency'],
      anomalyMastery: ['Anomaly_Mastery'],
      pen: ['PEN'],
      penRatio: ['PEN_Ratio'],
      impact: ['Impact'],
      energyRegen: ['Energy_Regen'],
    };

    // Try to get build-specific weights from agent-stat-weights.json
    if (agentId && this.agentStatWeights[agentId]) {
      // If buildType not provided, use first available build
      const availableBuilds = Object.keys(this.agentStatWeights[agentId].builds || {});
      const selectedBuildType = buildType || availableBuilds[0];

      if (selectedBuildType) {
        const buildData = this.agentStatWeights[agentId].builds?.[selectedBuildType];
        if (buildData) {
          // Aggregate max weight for this stat across all contexts
          let maxWeight = 0;
          Object.values(buildData.contextualWeights || {}).forEach((slotData: any) => {
            Object.values(slotData || {}).forEach((mainStatData: any) => {
              const possibleStatNames = statTypeMap[statKey] || [];
              possibleStatNames.forEach(statName => {
                const weight = mainStatData.substatWeights?.[statName] || 0;
                maxWeight = Math.max(maxWeight, weight);
              });
            });
          });
          // Stat is priority if weight >= 1.0
          return maxWeight >= 1.0;
        }
      }
    }

    // Fallback: Use priorityStats array if available (legacy format)
    if (breakpoints?.priorityStats && Array.isArray(breakpoints.priorityStats)) {
      const legacyStatTypeMap: { [key: string]: string[] } = {
        critRate: ['CRIT_Rate', 'critRate'],
        critDmg: ['CRIT_DMG', 'critDmg'],
        atk: ['ATK%', 'ATK', 'atk'],
        hp: ['HP%', 'HP', 'hp'],
        def: ['DEF%', 'DEF', 'def'],
        anomalyProficiency: ['Anomaly_Proficiency', 'anomalyProficiency'],
        anomalyMastery: ['Anomaly_Mastery', 'anomalyMastery'],
        pen: ['PEN', 'pen'],
        penRatio: ['PEN_Ratio', 'penRatio'],
        impact: ['Impact', 'impact'],
        energyRegen: ['Energy_Regen', 'energyRegen'],
      };

      const possibleStatNames = legacyStatTypeMap[statKey] || [];
      return possibleStatNames.some((statName) =>
        breakpoints.priorityStats!.includes(statName)
      );
    }

    return false;
  }

  /**
   * Get W-Engine stat contributions with reduced weight
   */
  private getWEngineStatContribution(
    wEngine?: WEngine
  ): Partial<BaseStats> {
    if (!wEngine) {
      return {};
    }

    const contribution: Partial<BaseStats> = {};
    const weight = EXTERNAL_STAT_WEIGHTS.WENGINE;

    // Add base ATK contribution (always present on W-Engines)
    contribution.atk = (wEngine.baseAtk || 0) * weight;

    // Add substat contribution
    if (wEngine.subStat) {
      const statType = wEngine.subStat.type;
      const value = wEngine.subStat.value * weight;

      switch (statType) {
        case 'ATK%':
          contribution.atkpercent = value;
          break;
        case 'HP%':
          contribution.hppercent = value;
          break;
        case 'DEF%':
          contribution.defpercent = value;
          break;
        case 'CRIT_Rate':
          contribution.critRate = value;
          break;
        case 'CRIT_DMG':
          contribution.critDmg = value;
          break;
        case 'PEN_Ratio':
          contribution.penRatio = value;
          break;
        case 'Energy_Regen':
          contribution.energyRegen = value;
          break;
        case 'Impact':
          contribution.impact = value;
          break;
        case 'Anomaly_Proficiency':
          contribution.anomalyProficiency = value;
          break;
      }
    }

    return contribution;
  }

  /**
   * Get Mindscape stat contributions with reduced weight
   */
  private getMindscapeStatContribution(
    agentId: string,
    mindscapeLevel: number
  ): Partial<BaseStats> {
    if (!this.mindscapeData || mindscapeLevel === 0) {
      return {};
    }

    const agentMindscapes = this.mindscapeData.mindscapes[agentId];
    if (!agentMindscapes) {
      return {};
    }

    const contribution: Partial<BaseStats> = {};
    const weight = EXTERNAL_STAT_WEIGHTS.MINDSCAPE;

    // Accumulate all mindscape bonuses up to the current level
    for (let level = 1; level <= mindscapeLevel; level++) {
      const bonuses = agentMindscapes[level];
      if (bonuses) {
        bonuses.forEach((bonus) => {
          const value = bonus.value * weight;

          switch (bonus.type) {
            case 'ATK%':
              contribution.atkpercent = (contribution.atkpercent || 0) + value;
              break;
            case 'HP%':
              contribution.hppercent = (contribution.hppercent || 0) + value;
              break;
            case 'DEF%':
              contribution.defpercent = (contribution.defpercent || 0) + value;
              break;
            case 'CRIT_Rate':
              contribution.critRate = (contribution.critRate || 0) + value;
              break;
            case 'CRIT_DMG':
              contribution.critDmg = (contribution.critDmg || 0) + value;
              break;
            case 'PEN_Ratio':
              contribution.penRatio = (contribution.penRatio || 0) + value;
              break;
            case 'Energy_Regen':
              contribution.energyRegen =
                (contribution.energyRegen || 0) + value;
              break;
            case 'Impact':
              contribution.impact = (contribution.impact || 0) + value;
              break;
            case 'Anomaly_Proficiency':
              contribution.anomalyProficiency =
                (contribution.anomalyProficiency || 0) + value;
              break;
            case 'Anomaly_Mastery':
              contribution.anomalyMastery =
                (contribution.anomalyMastery || 0) + value;
              break;
          }
        });
      }
    }

    return contribution;
  }

  /**
   * Apply weighted external stat contributions to base stats
   */
  private applyWeightedStats(
    baseStats: BaseStats,
    wEngineContribution: Partial<BaseStats>,
    mindscapeContribution: Partial<BaseStats>
  ): BaseStats {
    const weightedStats: BaseStats = { ...baseStats };

    // Apply W-Engine contributions
    Object.keys(wEngineContribution).forEach((key) => {
      const statKey = key as keyof BaseStats;
      weightedStats[statKey] =
        (weightedStats[statKey] || 0) + (wEngineContribution[statKey] || 0);
    });

    // Apply Mindscape contributions
    Object.keys(mindscapeContribution).forEach((key) => {
      const statKey = key as keyof BaseStats;
      weightedStats[statKey] =
        (weightedStats[statKey] || 0) + (mindscapeContribution[statKey] || 0);
    });

    return weightedStats;
  }

  /**
   * Convert upgrade plan custom breakpoints to AgentBreakpoints format
   * This allows the existing scoring logic to work with custom user-defined breakpoints
   */
  private convertUpgradePlanToBreakpoints(upgradePlan: UpgradePlan): AgentBreakpoints | null {
    if (!upgradePlan.customBreakpoints) {
      return null;
    }

    // Convert upgrade plan format to AgentBreakpoints format
    const breakpoints: any = {};

    Object.keys(upgradePlan.customBreakpoints).forEach(statKey => {
      breakpoints[statKey] = {
        min: upgradePlan.customBreakpoints[statKey].min,
        optimal: upgradePlan.customBreakpoints[statKey].optimal
      };
    });

    return {
      name: upgradePlan.name,
      breakpoints: breakpoints,
      priorityStats: [], // Not used when upgrade plan is active
      statWeights: {} // Not used when upgrade plan is active
    };
  }

  /**
   * Calculate composite build score
   * Combines 4 components:
   * - Breakpoint Score (40%): Meeting stat breakpoints
   * - Disc Quality Score (30%): Average rating of equipped discs
   * - Stat Efficiency Score (20%): Bonus for exceeding optimal, penalty for waste
   * - Set Bonus Score (10%): Whether set effects align with agent needs
   *
   * W-Engine and Mindscape stats are included with 0.25x weight
   *
   * NEW: If upgrade plan is provided, use custom breakpoints and priorities
   */
  calculateCompositeBuildScore(
    agentId: string,
    stats: BaseStats,
    equippedDiscs: Disc[],
    wEngine?: WEngine,
    _wEngineRefinement?: number,
    mindscapeLevel: number = 0,
    agentName?: string,
    agentRole?: string,
    agentElement?: string,
    agentLevel?: number,
    agentScoring?: { buffs: any[]; debuffs: any[]; dazeBonus: number },
    wengineScoring?: { buffs: any[]; debuffs: any[]; dazeBonus: number },
    upgradePlan?: UpgradePlan  // NEW: Use upgrade plan if provided
  ): { score: number; rating: BuildRating; breakdown: any } {
    // Check if build has all 6 discs equipped
    if (!equippedDiscs || equippedDiscs.length < 6) {
      const incompleteRating = BUILD_RATING_THRESHOLDS.find(r => r.grade === 'INCOMPLETE');
      return {
        score: 0,
        rating: incompleteRating || BUILD_RATING_THRESHOLDS[BUILD_RATING_THRESHOLDS.length - 1],
        breakdown: {
          message: `Incomplete build - ${equippedDiscs?.length || 0}/6 disc slots filled. Equip all 6 discs to receive a rating.`
        },
      };
    }

    // Check if any disc has validation errors (duplicate substats or main=sub conflicts)
    const invalidDiscs = equippedDiscs.filter(disc => hasValidationErrors(disc));
    if (invalidDiscs.length > 0) {
      const incompleteRating = BUILD_RATING_THRESHOLDS.find(r => r.grade === 'INCOMPLETE');
      return {
        score: 0,
        rating: incompleteRating || BUILD_RATING_THRESHOLDS[BUILD_RATING_THRESHOLDS.length - 1],
        breakdown: {
          message: `Incomplete build - ${invalidDiscs.length} disc${invalidDiscs.length > 1 ? 's have' : ' has'} validation errors. Fix invalid discs to receive a rating.`
        },
      };
    }

    // Use custom breakpoints from upgrade plan if provided, otherwise use default
    const breakpoints = upgradePlan
      ? this.convertUpgradePlanToBreakpoints(upgradePlan)
      : this.agentBreakpoints[agentId];

    if (!breakpoints) {
      return {
        score: 0,
        rating: BUILD_RATING_THRESHOLDS[BUILD_RATING_THRESHOLDS.length - 1],
        breakdown: { message: 'No breakpoints defined for this agent' },
      };
    }

    // Calculate weighted contributions from W-Engine and Mindscape
    const wEngineContribution = this.getWEngineStatContribution(wEngine);
    const mindscapeContribution = this.getMindscapeStatContribution(
      agentId,
      mindscapeLevel
    );

    // Apply weighted external stats to base stats
    const weightedStats = this.applyWeightedStats(
      stats,
      wEngineContribution,
      mindscapeContribution
    );

    // Detect build type for contextual scoring (CRIT, Anomaly, Support, etc.)
    // This determines which stat weights to use for disc and stat efficiency scoring
    const detectedBuildType = upgradePlan ? undefined : this.detectBuildType(equippedDiscs, agentId);

    // Calculate each component using weighted stats
    const breakpointResult = this.calculateBuildScore(agentId, weightedStats, detectedBuildType);
    const breakpointScore = breakpointResult.score; // 0-100 percentage
    const discQualityScore = this.calculateDiscQualityScore(
      equippedDiscs,
      agentId,
      upgradePlan  // Pass upgrade plan to use custom priorities
    ); // 0-100

    const statEfficiencyScore = this.calculateStatEfficiencyScore(
      weightedStats,
      breakpoints,
      agentId,
      detectedBuildType
    ); // 0-100

    // Calculate damage estimation score (if agent info provided)
    let damageScore = 0;
    let damageEstimate: any = null;

    if (agentName && agentRole && agentElement) {
      // Calculate elemental DMG% from equipped discs (slot 5 main stat)
      let elementalDMGBonus = 0;
      const slot5Disc = equippedDiscs.find((d) => d.slot === 'Drive5');
      if (slot5Disc?.mainStat.type.includes('DMG')) {
        elementalDMGBonus = slot5Disc.mainStat.value / 100; // Convert % to decimal
      }

      // Estimate damage - pass HP and Impact for Rupture/Stun calculations
      damageEstimate = this.estimateBuildDamage(
        {
          ATK: weightedStats.atk,
          HP: weightedStats.hp,
          critRate: weightedStats.critRate,
          critDMG: weightedStats.critDmg,
          penRatio: weightedStats.penRatio,
          flatPEN: weightedStats.pen,
          anomalyProficiency: weightedStats.anomalyProficiency,
          anomalyMastery: weightedStats.anomalyMastery,
          impact: weightedStats.impact,
          level: agentLevel || 60,
        },
        agentId,
        agentName,
        agentRole,
        agentElement,
        elementalDMGBonus,
        agentScoring,
        wengineScoring
      );

      // Normalize damage to 0-100 score
      // Pass dazeContribution for Stun agents
      damageScore = this.normalizeDamageScore(
        damageEstimate.totalDamage,
        agentRole,
        damageEstimate.dazeContribution
      );
    }

    // Combine with weights
    const compositeScore =
      breakpointScore * BUILD_SCORE_WEIGHTS.BREAKPOINT +
      discQualityScore * BUILD_SCORE_WEIGHTS.DISC_QUALITY +
      statEfficiencyScore * BUILD_SCORE_WEIGHTS.STAT_EFFICIENCY +
      damageScore * BUILD_SCORE_WEIGHTS.DAMAGE_OUTPUT;

    const rating = this.getBuildRating(compositeScore);

    return {
      score: Math.round(compositeScore * 10) / 10,
      rating: rating,
      breakdown: {
        breakpointScore: Math.round(breakpointScore * 10) / 10,
        breakpointDetails: breakpointResult.breakdown,
        discQualityScore: Math.round(discQualityScore * 10) / 10,
        statEfficiencyScore: Math.round(statEfficiencyScore * 10) / 10,
        damageScore:
          damageScore > 0 ? Math.round(damageScore * 10) / 10 : undefined,
        damageEstimate: damageEstimate,
        wEngineContribution: wEngineContribution,
        mindscapeContribution: mindscapeContribution,
        componentWeights: BUILD_SCORE_WEIGHTS,
      },
    };
  }

  /**
   * Generate actionable feedback for improving a build
   * Returns prioritized suggestions based on what would have the most impact
   */
  generateBuildFeedback(
    agentId: string,
    stats: BaseStats,
    equippedDiscs: { [slot: string]: Disc | undefined },
    hasWEngine: boolean,
    isWEngineSpecialtyMatch: boolean,
    upgradePlan?: UpgradePlan
  ): FeedbackItem[] {
    const feedback: FeedbackItem[] = [];
    const breakpoints = this.agentBreakpoints[agentId];

    // If no breakpoints defined, we can't give stat-specific feedback
    if (!breakpoints) {
      feedback.push({
        priority: 'low',
        category: 'stat',
        message: 'No optimization data available for this agent yet',
      });
      return feedback;
    }

    // Check for missing W-Engine (high priority)
    if (!hasWEngine) {
      feedback.push({
        priority: 'high',
        category: 'wengine',
        message: 'Equip a W-Engine to boost your stats',
      });
    } else if (!isWEngineSpecialtyMatch) {
      feedback.push({
        priority: 'medium',
        category: 'wengine',
        message: 'W-Engine specialty does not match agent - consider switching for full bonuses',
      });
    }

    // Check for empty disc slots (high priority)
    const discSlots = ['Drive1', 'Drive2', 'Drive3', 'Drive4', 'Drive5', 'Drive6'];
    const emptySlots = discSlots.filter(slot => !equippedDiscs[slot]);

    if (emptySlots.length > 0) {
      const slotNames = emptySlots.map(s => s.replace('Drive', 'Drive ')).join(', ');
      feedback.push({
        priority: 'high',
        category: 'disc',
        message: `Equip discs in empty slots: ${slotNames}`,
      });
    }

    // Check disc quality and find worst discs
    // First, detect build type based on all equipped discs
    const allDiscs = discSlots.map(slot => equippedDiscs[slot]).filter(d => d) as Disc[];
    const detectedBuildType = allDiscs.length > 0 ? this.detectBuildType(allDiscs, agentId) : undefined;

    const discScores: Array<{ slot: string; score: number; grade: string }> = [];
    discSlots.forEach(slot => {
      const disc = equippedDiscs[slot];
      if (disc) {
        // Use detected build type to ensure consistent scoring
        const scoreResult = this.calculateDiscScore(disc, agentId, detectedBuildType, upgradePlan);
        discScores.push({
          slot,
          score: scoreResult.score,
          grade: scoreResult.rating.grade,
        });
      }
    });

    // Check stat breakpoints and build a list of stats that need improvement
    const statMapping: { [key: string]: { value: number; label: string; unit: string; substatName: string } } = {
      hp: { value: stats.hp, label: 'HP', unit: '', substatName: 'HP%' },
      atk: { value: stats.atk, label: 'ATK', unit: '', substatName: 'ATK%' },
      def: { value: stats.def, label: 'DEF', unit: '', substatName: 'DEF%' },
      impact: { value: stats.impact, label: 'Impact', unit: '', substatName: 'Impact' },
      anomalyMastery: { value: stats.anomalyMastery, label: 'Anomaly Mastery', unit: '', substatName: 'Anomaly Mastery' },
      critRate: { value: stats.critRate, label: 'CRIT Rate', unit: '%', substatName: 'CRIT Rate' },
      critDmg: { value: stats.critDmg, label: 'CRIT DMG', unit: '%', substatName: 'CRIT DMG' },
      anomalyProficiency: { value: stats.anomalyProficiency, label: 'Anomaly Proficiency', unit: '', substatName: 'Anomaly Prof' },
      pen: { value: stats.pen, label: 'PEN', unit: '', substatName: 'PEN' },
      penRatio: { value: stats.penRatio, label: 'PEN Ratio', unit: '%', substatName: 'PEN Ratio' },
      energyRegen: { value: stats.energyRegen, label: 'Energy Regen', unit: '%', substatName: 'Energy Regen' },
    };

    // Check for CRIT Rate overcap (warn if > 100%)
    if (stats.critRate > 100) {
      const overcap = stats.critRate - 100;
      // Only show the specific overcap value if it's >= 1% (i.e., total critRate >= 101%)
      const message = stats.critRate >= 101
        ? `CRIT Rate overcapped by ${overcap.toFixed(1)}% (${stats.critRate.toFixed(1)}% total)`
        : `CRIT Rate is overcapped - watch out for rolling more crit rate substats`;
      feedback.push({
        priority: 'medium',
        category: 'stat',
        message,
        stat: 'critRate',
        currentValue: stats.critRate,
        targetValue: 100,
      });
    }

    // Get the build-aware stat weights for feedback FIRST
    // This ensures we only suggest stats that are valuable for the detected build type
    const buildStatWeights: { [stat: string]: number } = {};
    if (detectedBuildType && this.agentStatWeights[agentId]) {
      const buildData = this.agentStatWeights[agentId].builds?.[detectedBuildType];
      if (buildData) {
        // Aggregate max weight for each stat across all disc slots/main stats
        Object.values(buildData.contextualWeights || {}).forEach((slotData: any) => {
          Object.values(slotData || {}).forEach((mainStatData: any) => {
            Object.entries(mainStatData.substatWeights || {}).forEach(([stat, weight]) => {
              buildStatWeights[stat] = Math.max(buildStatWeights[stat] || 0, weight as number);
            });
          });
        });
      }
    }
    // Use build-aware stat weights (from agent-stat-weights.json)
    // Fallback to priorityStats array if no stat weights available
    const statWeightsToUse = buildStatWeights;

    // Map substat types to their weight key names
    const substatToWeightKey: { [key: string]: string } = {
      'HP': 'HP',
      'HP%': 'HP%',
      'ATK': 'ATK',
      'ATK%': 'ATK%',
      'DEF': 'DEF',
      'DEF%': 'DEF%',
      'CRIT_Rate': 'CRIT_Rate',
      'CRIT_DMG': 'CRIT_DMG',
      'PEN': 'PEN',
      'Anomaly_Proficiency': 'Anomaly_Proficiency',
      'Anomaly_Mastery': 'Anomaly_Mastery',
      'Impact': 'Impact',
      'Energy_Regen': 'Energy_Regen',
    };

    // Build list of stats that need improvement (for disc suggestions)
    // Now uses build-aware weights to only suggest stats valued in the detected build
    const statsNeedingImprovement: Array<{ stat: string; substatName: string; deficit: number; weight: number }> = [];

    // Map breakpoint stat keys to weight keys
    const breakpointToWeightKey: { [key: string]: string } = {
      'hp': 'HP%',
      'atk': 'ATK%',
      'def': 'DEF%',
      'impact': 'Impact',
      'anomalyMastery': 'Anomaly_Mastery',
      'critRate': 'CRIT_Rate',
      'critDmg': 'CRIT_DMG',
      'anomalyProficiency': 'Anomaly_Proficiency',
      'pen': 'PEN',
      'penRatio': 'PEN_Ratio',
      'energyRegen': 'Energy_Regen',
    };

    Object.keys(breakpoints.breakpoints).forEach(statKey => {
      const breakpoint = breakpoints.breakpoints[statKey as keyof typeof breakpoints.breakpoints];
      const statInfo = statMapping[statKey];
      if (!statInfo || breakpoint.optimal === 0) return;

      const current = statInfo.value;
      const optimal = breakpoint.optimal;

      // Skip CRIT Rate if already at or above optimal OR 100% (only stat where excess hurts)
      if (statKey === 'critRate' && (current >= optimal || current >= 100)) return;

      // Get weight from build-aware weights (only suggest if weight >= 1.0)
      const weightKey = breakpointToWeightKey[statKey];
      const weight = weightKey ? (statWeightsToUse[weightKey] || 0) : 0;

      // Only suggest improvement if weight >= 1.0 (highly valued in this build)
      if (current < optimal && weight >= 1.0) {
        const deficit = optimal - current;
        const deficitPercent = deficit / optimal;
        statsNeedingImprovement.push({
          stat: statKey,
          substatName: statInfo.substatName,
          deficit: deficitPercent,
          weight: weight,
        });
      }
    });

    // Sort by weight * deficit (highest priority improvements first)
    statsNeedingImprovement.sort((a, b) => (b.weight * b.deficit) - (a.weight * a.deficit));

    // Analyze each disc's substats for wasted rolls
    const discAnalysis: Array<{
      slot: string;
      grade: string;
      score: number;
      wastedStats: string[];
      missingPriorityStats: string[];
      lowRollPriorityStats: string[];
    }> = [];

    discSlots.forEach(slot => {
      const disc = equippedDiscs[slot];
      if (!disc) return;

      const scoreResult = discScores.find(d => d.slot === slot);
      if (!scoreResult) return;

      const wastedStats: string[] = [];
      const presentStats: string[] = [];
      const lowRollPriorityStats: string[] = [];

      // Check each substat
      disc.subStats.forEach(sub => {
        const weightKey = substatToWeightKey[sub.type];
        presentStats.push(weightKey);

        // Get weight for this substat from the detected build's weights
        let weight = statWeightsToUse[weightKey] || 0;

        // Check if this is a priority stat with low rolls (1 or fewer upgrade rolls)
        // Rolls are: 1 initial + upgrades, so rolls <= 2 means 1 or fewer upgrades
        if (weight >= 1.0 && sub.rolls && sub.rolls <= 2) {
          const displayName = sub.type.replace('_', ' ').replace('%', '%');
          lowRollPriorityStats.push(displayName);
        }

        // Skip CRIT Rate check if overcapped - it's now a wasted stat
        if (sub.type === 'CRIT_Rate' && stats.critRate >= 100) {
          wastedStats.push('CRIT Rate');
        } else if (weight < 1.0) {
          // Only flag as wasted if weight < 1.0 (not highly valued in this build)
          const displayName = sub.type.replace('_', ' ').replace('%', '%');
          wastedStats.push(displayName);
        }
      });

      // Find which priority stats (weight >= 1.0) are missing from this disc
      const missingPriorityStats: string[] = [];

      // Map main stat type to weight key for comparison
      const mainStatWeightKey = disc.mainStat.type.replace('CRIT_Rate', 'CRIT_Rate')
                                                   .replace('CRIT_DMG', 'CRIT_DMG')
                                                   .replace('Anomaly_Proficiency', 'Anomaly_Proficiency')
                                                   .replace('Anomaly_Mastery', 'Anomaly_Mastery')
                                                   .replace('Energy_Regen', 'Energy_Regen')
                                                   .replace('Pen_Ratio', 'PEN_Ratio');

      // OPTIMIZED: Combine two sequential filters into single pass
      Object.entries(statWeightsToUse)
        .filter(([stat, weight]) => {
          // First filter: Check if stat is worth considering
          const isCritRateAwkwardZone = stat === 'CRIT_Rate' && stats.critRate > 30 && stats.critRate < 50;
          const hasHighWeight = weight >= 1.0;

          if (!isCritRateAwkwardZone && !hasHighWeight) {
            return false;
          }

          // Second filter: Check if stat should be excluded
          const isCritRateOvercap = stat === 'CRIT_Rate' && (
            stats.critRate >= 100 ||
            (stats.critRate >= breakpoints.breakpoints.critRate.optimal && stats.critRate >= 50)
          );
          const isMainStatConflict = stat === mainStatWeightKey ||
            (stat.includes('ATK') && disc.mainStat.type.includes('ATK')) ||
            (stat.includes('HP') && disc.mainStat.type.includes('HP')) ||
            (stat.includes('DEF') && disc.mainStat.type.includes('DEF'));

          return !isCritRateOvercap && !isMainStatConflict;
        })
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .forEach(([stat]) => {
          if (!presentStats.includes(stat)) {
            const displayName = stat.replace('_', ' ').replace('%', '%');
            missingPriorityStats.push(displayName);
          }
        });

      discAnalysis.push({
        slot,
        grade: scoreResult.grade,
        score: scoreResult.score,
        wastedStats,
        missingPriorityStats,
        lowRollPriorityStats,
      });
    });

    // Find discs rated D or F (high priority to replace)
    const terribleDiscs = discAnalysis.filter(d => d.grade === 'D' || d.grade === 'F');
    terribleDiscs.sort((a, b) => a.score - b.score);

    // Show ALL terrible discs (not just 2) - these are critical to replace
    terribleDiscs.forEach(disc => {
      let message = `Replace ${disc.slot.replace('Drive', 'Drive ')} disc (rated ${disc.grade})`;

      // Suggest priority stats that this disc is missing
      if (disc.missingPriorityStats.length > 0) {
        message += ` - Substat Suggestion: ${disc.missingPriorityStats.slice(0, 3).join(', ')}`;
      } else if (disc.lowRollPriorityStats.length > 0) {
        const stats = disc.lowRollPriorityStats.slice(0, 2).join(', ');
        message += ` - Low rolls on: ${stats}`;
      } else {
        message += ` - Poor substats overall`;
      }

      feedback.push({
        priority: 'high',
        category: 'disc',
        message,
      });
    });

    // Find discs rated C (medium priority) - only if no terrible discs
    const poorDiscs = discAnalysis.filter(d => d.grade === 'C');
    if (poorDiscs.length > 0 && terribleDiscs.length === 0) {
      poorDiscs.sort((a, b) => a.score - b.score);

      // Give specific feedback for C-rated discs
      poorDiscs.slice(0, 2).forEach(disc => {
        let message = `Upgrade ${disc.slot.replace('Drive', 'Drive ')} (rated C)`;

        // Suggest priority stats that this disc is missing
        if (disc.missingPriorityStats.length > 0) {
          message += ` - Substat Suggestion: ${disc.missingPriorityStats.slice(0, 3).join(', ')}`;
        }

        feedback.push({
          priority: 'medium',
          category: 'disc',
          message,
        });
      });
    }

    // Find discs rated B (low priority)
    const okDiscs = discAnalysis.filter(d => d.grade === 'B');
    if (okDiscs.length > 0) {
      okDiscs.sort((a, b) => a.score - b.score);

      // Give specific feedback for B-rated discs
      okDiscs.slice(0, 2).forEach(disc => {
        let message = `${disc.slot.replace('Drive', 'Drive ')} needs improvement (rated B)`;

        // Suggest priority stats that this disc is missing
        if (disc.missingPriorityStats.length > 0) {
          message += ` - Substat Suggestion: ${disc.missingPriorityStats.slice(0, 3).join(', ')}`;
        }
        // Or mention low rolls on priority stats if missing stats aren't the issue
        else if (disc.lowRollPriorityStats.length > 0) {
          const stats = disc.lowRollPriorityStats.slice(0, 2).join(', ');
          message += ` - Low rolls on: ${stats}`;
        }

        feedback.push({
          priority: 'low',
          category: 'disc',
          message,
        });
      });
    }

    // No separate feedback for A+ rated discs - they're already good enough!

    // Check priority stats first (they matter more)
    Object.keys(breakpoints.breakpoints).forEach(statKey => {
      const breakpoint = breakpoints.breakpoints[statKey as keyof typeof breakpoints.breakpoints];
      const statInfo = statMapping[statKey];

      if (!statInfo || breakpoint.optimal === 0) return;

      const isPriority = this.isPriorityStat(statKey, agentId, detectedBuildType, breakpoints);
      const current = statInfo.value;
      const min = breakpoint.min;
      const optimal = breakpoint.optimal;

      // Below minimum (high priority for priority stats)
      if (current < min && isPriority) {
        const deficit = Math.round(min - current);
        feedback.push({
          priority: 'high',
          category: 'stat',
          message: `${statInfo.label} is ${Math.round(current)}${statInfo.unit} (need ${min}${statInfo.unit}) - ${deficit}${statInfo.unit} below minimum`,
          stat: statKey,
          currentValue: current,
          targetValue: min,
        });
      }
      // Between min and optimal (medium priority for priority stats)
      else if (current < optimal && current >= min && isPriority) {
        const deficit = Math.round(optimal - current);
        feedback.push({
          priority: 'medium',
          category: 'stat',
          message: `${statInfo.label} is ${Math.round(current)}${statInfo.unit} (optimal: ${optimal}${statInfo.unit}) - ${deficit}${statInfo.unit} to go`,
          stat: statKey,
          currentValue: current,
          targetValue: optimal,
        });
      }
      // Below minimum for non-priority stats (low priority)
      else if (current < min && !isPriority) {
        feedback.push({
          priority: 'low',
          category: 'stat',
          message: `${statInfo.label} is below target (${Math.round(current)}${statInfo.unit} / ${min}${statInfo.unit})`,
          stat: statKey,
          currentValue: current,
          targetValue: min,
        });
      }
    });

    // Sort by priority and category: disc feedback first (especially C-F rated discs), then stat feedback
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    feedback.sort((a, b) => {
      // First, sort by priority
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // Within same priority, disc feedback comes before stat feedback
      if (a.category === 'disc' && b.category !== 'disc') return -1;
      if (a.category !== 'disc' && b.category === 'disc') return 1;

      return 0;
    });

    // Limit to top 5 suggestions to avoid overwhelming the user
    // But ensure at least all high-priority disc feedback is included
    const highPriorityDiscFeedback = feedback.filter(f => f.priority === 'high' && f.category === 'disc');
    const otherFeedback = feedback.filter(f => !(f.priority === 'high' && f.category === 'disc'));

    return [...highPriorityDiscFeedback, ...otherFeedback].slice(0, 5);
  }
}
