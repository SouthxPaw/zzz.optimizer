import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Disc } from '../models/disc.model';
import { BaseStats, WEngine } from '../models/agent.model';
import {
  MAIN_STAT_BONUS,
  DISC_RATING_THRESHOLDS,
  BUILD_RATING_THRESHOLDS,
  EXTERNAL_STAT_WEIGHTS,
  BUILD_SCORE_WEIGHTS,
  DIMINISHING_RETURNS,
  BREAKPOINT_PENALTIES,
  DiscRating,
  BuildRating,
  FeedbackItem,
} from '../constants/disc-scoring';
import { DISC_SET_EQUIPMENT_IDS } from '../constants/disc-set-ids';
import { calculateRollCount } from '../constants/substat-rolls';
import {
  estimateDamage,
  calculateStatusDamage,
  calculateSheerForce,
  calculateDazeContribution,
  calculateAnomalyBuildup,
} from '../constants/damage-formulas';
import {
  DEFAULT_ENEMY_PROFILE,
} from '../constants/enemy-profiles';
import {
  getAgentSkillMultiplier,
  getAgentDamageType,
  getStatusEffectType,
} from '../constants/agent-skills';
import { SkillParserService } from './skill-parser.service';
import { versionedUrl } from '../utils/versioned-url';

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
  private discSetData: { [setId: string]: DiscSetData } = {};
  private mindscapeData: MindscapeData | null = null;

  constructor(
    private http: HttpClient,
    private skillParserService: SkillParserService
  ) {
    this.loadAllData();
  }

  /**
   * Load all data needed for scoring
   */
  private async loadAllData() {
    await Promise.all([
      this.loadAgentBreakpoints(),
      this.loadDiscSetData(),
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
      console.warn('Failed to load skill multipliers:', error);
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
      console.log('Loaded agent breakpoints for scoring');
    } catch (error) {
      console.error('Failed to load agent breakpoints:', error);
    }
  }

  /**
   * Load disc set data from equipment JSON files
   */
  private async loadDiscSetData() {
    try {
      const promises = DISC_SET_EQUIPMENT_IDS.map(
        (id) =>
          firstValueFrom(
            this.http.get<DiscSetData>(versionedUrl(`assets/data/equipment/${id}.json`))
          ).catch(() => null) // Ignore errors for missing files
      );

      const results = await Promise.all(promises);
      results.forEach((data, index) => {
        if (data) {
          this.discSetData[DISC_SET_EQUIPMENT_IDS[index]] = data;
        }
      });

      console.log('Loaded disc set data for scoring');
    } catch (error) {
      console.error('Failed to load disc set data:', error);
    }
  }

  /**
   * Load mindscape stat bonuses
   */
  private async loadMindscapeData() {
    try {
      this.mindscapeData = await firstValueFrom(
        this.http.get<MindscapeData>(versionedUrl('assets/data/mindscape-stats.json'))
      );
      console.log('Loaded mindscape data for scoring');
    } catch (error) {
      console.error('Failed to load mindscape data:', error);
    }
  }

  /**
   * Apply diminishing returns to a stat value
   * Prevents over-investment in a single stat beyond optimal thresholds
   *
   * @param statType - Type of stat (for determining power exponent)
   * @param rawValue - Actual stat value
   * @param optimalValue - Optimal target value from breakpoints
   * @returns Adjusted value with diminishing returns applied
   */
  private applyDiminishingReturns(
    statType: string,
    rawValue: number,
    optimalValue: number
  ): number {
    // If no optimal defined or value is at/below threshold, no penalty
    if (
      optimalValue <= 0 ||
      rawValue <= optimalValue * DIMINISHING_RETURNS.THRESHOLD_PERCENT
    ) {
      return rawValue;
    }

    const threshold = optimalValue * DIMINISHING_RETURNS.THRESHOLD_PERCENT;
    const excess = rawValue - threshold;

    // Determine power based on stat type
    const power =
      statType === 'energyRegen'
        ? DIMINISHING_RETURNS.POWER.ENERGY
        : DIMINISHING_RETURNS.POWER.STANDARD;

    // Apply power function to excess
    const diminishedExcess = Math.pow(excess, power);

    return threshold + diminishedExcess;
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

    // Between min and optimal - apply partial penalty
    // Linear scaling between min (full penalty) and optimal (no penalty)
    const range = breakpoint.optimal - breakpoint.min;
    const position = currentValue - breakpoint.min;
    const percentOfRange = range > 0 ? position / range : 0;

    // Interpolate penalty from MISSING_OPTIMAL at min to 0 at optimal
    const penalty = BREAKPOINT_PENALTIES.MISSING_OPTIMAL * (1 - percentOfRange);

    return 1.0 - penalty;
  }

  /**
   * Calculate disc score based on substats and main stat
   * Uses agent-specific weights from breakpoints config
   * Combines stat importance weights with roll quality multiplier
   *
   * BACKWARD COMPATIBLE:
   * - Old agents use priorityStats: ['CRIT_Rate', 'CRIT_DMG'] (all weighted 1.0)
   * - New agents use statWeights: { 'CRIT_Rate': 1.0, 'CRIT_DMG': 0.85 }
   */
  calculateDiscScore(
    disc: Disc,
    agentId?: string,
    equippedDiscs?: Disc[]
  ): { score: number; rating: DiscRating; breakdown: any } {
    let totalPoints = 0;
    const breakdown = {
      mainStatPoints: 0,
      subStatPoints: 0,
      detectedBuild: null as string | null,
      totalRolls: 0,
      details: [] as Array<{
        stat: string;
        value: number;
        points: number;
        rolls: number;
      }>,
    };

    // Use agent-specific stat weights (0.7-1.0 range)
    // Falls back to priorityStats array if statWeights not defined
    let statWeights: { [stat: string]: number } = {};

    if (agentId && this.agentBreakpoints[agentId]) {
      const agentConfig = this.agentBreakpoints[agentId];

      if (agentConfig.statWeights) {
        // New weighted system - use statWeights directly
        statWeights = agentConfig.statWeights;
      } else if (agentConfig.priorityStats) {
        // Old array system - convert to weights (all 1.0)
        if (Array.isArray(agentConfig.priorityStats)) {
          statWeights = agentConfig.priorityStats.reduce((acc, stat) => {
            acc[stat] = 1.0;
            return acc;
          }, {} as { [stat: string]: number });
        } else {
          // priorityStats is already an object (shouldn't happen, but handle it)
          statWeights = agentConfig.priorityStats;
        }
      }
    } else {
      // No agent specified - all stats weighted equally at 1.0
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

    // Award points for optimal main stat - only if it's a priority stat for this agent
    let mainStatBonus = 0;
    const baseMainStatBonus = MAIN_STAT_BONUS[disc.slot]?.[disc.mainStat.type] || 0;

    // Check if the main stat is in the agent's priority stats (not statWeights, which is for substats only)
    if (baseMainStatBonus > 0 && agentId && this.agentBreakpoints[agentId]) {
      const agentConfig = this.agentBreakpoints[agentId];
      if (agentConfig.priorityStats && Array.isArray(agentConfig.priorityStats)) {
        // Check if main stat appears in priorityStats array
        if (agentConfig.priorityStats.includes(disc.mainStat.type)) {
          mainStatBonus = baseMainStatBonus;
        }
      }
    } else if (!agentId) {
      // No agent specified - award bonus for any valid main stat
      mainStatBonus = baseMainStatBonus;
    }

    breakdown.mainStatPoints = mainStatBonus;
    totalPoints += mainStatBonus;

    // Score substats with: roll count × stat weight × quality multiplier
    // Note: Each disc has 3-4 initial substats + 5 upgrade rolls
    let totalWeightedRolls = 0;
    let priorityStatCount = 0;
    let maxRollCount = 0; // Count of substats with 4+ rolls
    let totalUpgradeRolls = 0; // Track total upgrade rolls (should be ~5)
    let upgradeRollsInPriorityStats = 0; // Track upgrades that went to priority stats

    disc.subStats.forEach((substat) => {
      // Calculate total roll count for this substat (initial + upgrades)
      const rolls = calculateRollCount(substat.type, substat.value);
      breakdown.totalRolls += rolls;

      // Estimate upgrade rolls: total rolls - 1 (subtract initial roll)
      // Each substat starts with 1 roll, then gets 0-5 upgrade rolls
      const upgradeRolls = Math.max(0, rolls - 1);
      totalUpgradeRolls += upgradeRolls;

      // Get stat weight (0.7-1.0 range, or undefined if not a priority stat)
      const statWeight = statWeights[substat.type];

      // Only score stats that are in the agent's priority list
      if (statWeight !== undefined && statWeight > 0) {
        upgradeRollsInPriorityStats += upgradeRolls;

        // Calculate quality multiplier based on roll count
        // Higher rolls into priority stats = better quality
        // Max realistic: 6 rolls (1 initial + 5 upgrades all into one stat)
        const rollQuality = Math.min(rolls / 6, 1.0);

        // Quality multiplier: 0.7 base + up to 0.3 bonus for high rolls
        // 1 roll = 0.77x, 3 rolls = 0.85x, 6 rolls = 1.0x
        const qualityMultiplier = 0.7 + rollQuality * 0.3;

        // Final weighted score: rolls × stat importance × roll quality
        const weightedScore = rolls * statWeight * qualityMultiplier;

        totalWeightedRolls += weightedScore;
        priorityStatCount++;

        // Track high-roll substats for bonus (4+ rolls = at least 3 upgrades)
        if (rolls >= 4) {
          maxRollCount++;
        }

        breakdown.subStatPoints += weightedScore;
        breakdown.details.push({
          stat: `${substat.type} (×${statWeight}, ${(
            qualityMultiplier * 100
          ).toFixed(0)}% quality)`,
          value: substat.value,
          points: Math.round(weightedScore * 10) / 10,
          rolls: rolls,
        });
      } else {
        // Show wasted stats with 0 contribution
        breakdown.details.push({
          stat: substat.type + ' (wasted)',
          value: substat.value,
          points: 0,
          rolls: rolls,
        });
      }
    });

    // Calculate upgrade roll efficiency (what % of the 5 upgrades went to priority stats)
    const upgradeEfficiency =
      totalUpgradeRolls > 0
        ? upgradeRollsInPriorityStats / totalUpgradeRolls
        : 0;

    // Bonus for having multiple priority stats
    // This rewards good substat selection - having the RIGHT stats matters
    let substatBonus = 0;
    if (priorityStatCount === 4) {
      // Perfect: all 4 substats are priority stats
      // Bonus: +12 effective rolls - NO wasted stats
      substatBonus = 12;
      breakdown.details.push({
        stat: 'Perfect Substats (4/4)',
        value: 4,
        points: substatBonus,
        rolls: 0,
      });
    } else if (priorityStatCount === 3) {
      // Excellent: 3/4 substats are priority stats (only 1 wasted)
      // Bonus: +8 effective rolls
      substatBonus = 8;
      breakdown.details.push({
        stat: 'Excellent Substats (3/4)',
        value: 3,
        points: substatBonus,
        rolls: 0,
      });
    }

    // Bonus for upgrade roll efficiency
    // Rewards discs where the 5 upgrade rolls went to priority stats instead of being wasted
    let upgradeEfficiencyBonus = 0;
    if (upgradeEfficiency >= 0.8) {
      // 80%+ of upgrades went to priority stats (4+ out of 5)
      upgradeEfficiencyBonus = 10;
      breakdown.details.push({
        stat: `Upgrade Efficiency (${Math.round(upgradeEfficiency * 100)}%)`,
        value: upgradeRollsInPriorityStats,
        points: upgradeEfficiencyBonus,
        rolls: totalUpgradeRolls,
      });
    } else if (upgradeEfficiency >= 0.6) {
      // 60%+ of upgrades went to priority stats (3+ out of 5)
      upgradeEfficiencyBonus = 6;
      breakdown.details.push({
        stat: `Upgrade Efficiency (${Math.round(upgradeEfficiency * 100)}%)`,
        value: upgradeRollsInPriorityStats,
        points: upgradeEfficiencyBonus,
        rolls: totalUpgradeRolls,
      });
    }

    // Bonus for high-roll substats (4+ rolls = 3+ upgrades into one stat)
    // Rewards discs with maxed or near-maxed priority stats
    let highRollBonus = 0;
    if (maxRollCount >= 2) {
      // 2+ substats with 4+ rolls = excellent concentration
      highRollBonus = maxRollCount * 4; // 4 bonus rolls per high-roll stat
      breakdown.details.push({
        stat: `High Roll Bonus (${maxRollCount} substats)`,
        value: maxRollCount,
        points: highRollBonus,
        rolls: 0,
      });
    } else if (maxRollCount === 1) {
      // 1 substat with 4+ rolls = very good
      highRollBonus = 5; // 5 bonus rolls
      breakdown.details.push({
        stat: 'High Roll Bonus (1 substat)',
        value: 1,
        points: highRollBonus,
        rolls: 0,
      });
    }

    // Total effective rolls with all bonuses
    const totalEffectiveRolls =
      totalWeightedRolls +
      substatBonus +
      upgradeEfficiencyBonus +
      highRollBonus;

    // Convert to 0-100 scale
    // Max theoretical weighted: 4 stats × 5 rolls × 1.0 weight × 1.0 quality = 20 base
    // With bonuses (perfect substats +12, high rolls), god rolls can exceed 100
    const maxTheoretical = 20;
    let finalScore = (totalEffectiveRolls / maxTheoretical) * 100;

    // Don't cap at 100 - let god rolls exceed it
    finalScore = Math.round(finalScore * 10) / 10;

    breakdown.details.push({
      stat: 'Total Effective Rolls',
      value: Math.round(totalEffectiveRolls * 10) / 10,
      points: finalScore,
      rolls: breakdown.totalRolls,
    });

    totalPoints = finalScore + mainStatBonus;

    // Determine rating based on total points
    const rating = this.getDiscRating(totalPoints);

    return {
      score: Math.round(totalPoints * 10) / 10,
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
   */
  calculateBuildScore(
    agentId: string,
    stats: BaseStats
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
      const isPriority = this.isPriorityStat(statKey, breakpoints);

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

    // Use default enemy profile for calculations
    const enemy = DEFAULT_ENEMY_PROFILE;

    let directDamage = 0;
    let statusDamage = 0;
    let sheerForceDamage = 0;
    let dazeContribution = 0;
    let damageType = 'direct';

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
        damageType = 'status';
        const statusType = getStatusEffectType(agentElement);
        statusDamage = calculateStatusDamage(statusType, stats.ATK, dmgBonuses);
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
          defShred
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
          defShred
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
          defShred
        );
        break;
    }

    // Calculate total damage based on damage type
    let totalDamage = 0;
    if (sheerForceDamage > 0) {
      totalDamage = sheerForceDamage;
    } else if (dazeContribution > 0) {
      // For Stun, use direct damage but also track daze
      totalDamage = directDamage;
    } else {
      totalDamage = directDamage + statusDamage;
    }

    // Apply DamageTaken multiplier from agent/w-engine scoring (final multiplier)
    if (damageTaken > 0) {
      totalDamage *= (1 + damageTaken);
      directDamage *= (1 + damageTaken);
      if (statusDamage > 0) statusDamage *= (1 + damageTaken);
      if (sheerForceDamage > 0) sheerForceDamage *= (1 + damageTaken);
    }

    return {
      directDamage: Math.round(directDamage),
      statusDamage: statusDamage > 0 ? Math.round(statusDamage) : undefined,
      sheerForceDamage: sheerForceDamage > 0 ? Math.round(sheerForceDamage) : undefined,
      dazeContribution: dazeContribution > 0 ? Math.round(dazeContribution * 100) / 100 : undefined,
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
      Anomaly: 40000,   // Status effect damage (per proc)
      Rupture: 35000,   // Sheer Force damage (ignores DEF but lower multiplier)
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
    agentId: string
  ): number {
    if (!equippedDiscs || equippedDiscs.length === 0) {
      return 0;
    }

    // Convert disc ratings to numeric scores
    const ratingToScore: { [key: string]: number } = {
      SSS: 100,
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
      const result = this.calculateDiscScore(disc, agentId, equippedDiscs);
      totalScore += ratingToScore[result.rating.grade] || 0;
    });

    // Return average score as percentage (0-100)
    return equippedDiscs.length > 0 ? totalScore / equippedDiscs.length : 0;
  }

  /**
   * Calculate stat efficiency score
   * Component 3 of composite build rating (20% weight)
   * Awards bonus for exceeding optimal breakpoints with diminishing returns
   * Penalizes investment in stats with 0 optimal value
   */
  private calculateStatEfficiencyScore(
    stats: BaseStats,
    breakpoints: AgentBreakpoints
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

    Object.keys(breakpoints.breakpoints).forEach((statKey) => {
      const breakpoint =
        breakpoints.breakpoints[
          statKey as keyof typeof breakpoints.breakpoints
        ];
      const currentValue = statMapping[statKey] || 0;

      if (breakpoint.optimal > 0) {
        // Stat matters - check if we exceed optimal
        if (currentValue > breakpoint.optimal) {
          const excessPercentage =
            ((currentValue - breakpoint.optimal) / breakpoint.optimal) * 100;
          // Diminishing returns: first 10% excess = +5 points, next 10% = +3, next 10% = +1
          if (excessPercentage <= 10) {
            efficiencyScore += excessPercentage * 0.5;
          } else if (excessPercentage <= 20) {
            efficiencyScore += 5 + (excessPercentage - 10) * 0.3;
          } else {
            efficiencyScore += 5 + 3 + (excessPercentage - 20) * 0.1;
          }
        }
      }
      // No penalty for investing in low-priority stats - let priorityStats handle it
    });

    // Clamp between 0-100
    return Math.max(0, Math.min(100, efficiencyScore));
  }

  /**
   * Calculate set bonus score
   * Component 4 of composite build rating (10% weight)
   * Evaluates if set effects align with agent's breakpoint weights
   */
  private calculateSetBonusScore(
    equippedDiscs: Disc[],
    agentId: string
  ): number {
    if (!equippedDiscs || equippedDiscs.length === 0) {
      return 0;
    }

    const breakpoints = this.agentBreakpoints[agentId];
    if (!breakpoints) {
      return 0;
    }

    // Count disc sets
    const setCounts: { [setName: string]: number } = {};
    equippedDiscs.forEach((disc) => {
      if (disc.set) {
        setCounts[disc.set] = (setCounts[disc.set] || 0) + 1;
      }
    });

    let setBonusScore = 0;
    let activeSets = 0;

    // Check each set for 2pc and 4pc bonuses
    Object.keys(setCounts).forEach((setName) => {
      const count = setCounts[setName];

      // Find the disc set data by name
      const setData = Object.values(this.discSetData).find(
        (s) => s.Name === setName
      );
      if (!setData || !setData['4pcEffect']) {
        return;
      }

      // Check 4pc bonus (if we have 4+ pieces)
      if (count >= 4) {
        activeSets++;
        const properties = setData['4pcEffect'].Properties;

        // Check if properties exist before iterating
        if (!properties || properties.length === 0) {
          return;
        }

        properties.forEach((prop) => {
          // Map property names to breakpoint keys
          const statKey = this.mapStatNameToBreakpointKey(prop.Name);
          if (statKey) {
            const breakpoint =
              breakpoints.breakpoints[
                statKey as keyof typeof breakpoints.breakpoints
              ];
            // Check if this stat is in priority list
            const isPriority = this.isPriorityStat(statKey, breakpoints);

            if (breakpoint && breakpoint.optimal > 0 && isPriority) {
              // Good set effect - aligns with agent needs
              setBonusScore += 10;
            } else if (breakpoint && breakpoint.optimal === 0) {
              // Bad set effect - doesn't align with agent needs
              setBonusScore -= 5;
            }
          }
        });
      }
      // Check 2pc bonus (if we have 2-3 pieces)
      else if (count >= 2) {
        activeSets++;
        // 2pc bonuses are usually element damage or simple stat boosts
        // Give a small bonus for having any 2pc active (neutral rating)
        setBonusScore += 5;
      }
    });

    // Normalize score to 0-100 scale
    // If no sets active, return 0
    // If sets active and aligned well, return up to 100
    return activeSets > 0 ? Math.max(0, Math.min(100, 50 + setBonusScore)) : 0;
  }

  /**
   * Map stat names from disc set data to breakpoint keys
   */
  private mapStatNameToBreakpointKey(statName: string): string | null {
    const mapping: { [key: string]: string } = {
      'ATK%': 'atk',
      ATK: 'atk',
      'HP%': 'hp',
      HP: 'hp',
      'DEF%': 'def',
      DEF: 'def',
      CRIT_Rate: 'critRate',
      CRIT_DMG: 'critDmg',
      Anomaly_Proficiency: 'anomalyProficiency',
      Anomaly_Mastery: 'anomalyMastery',
      PEN: 'pen',
      PEN_Ratio: 'penRatio',
      Impact: 'impact',
      Energy_Regen: 'energyRegen',
    };

    return mapping[statName] || null;
  }

  /**
   * Check if a stat is a priority stat for the agent
   * Handles both old priorityStats array format and new statWeights object format
   * @param statKey - Breakpoint stat key (e.g., 'critRate', 'anomalyProficiency')
   * @param breakpoints - Agent breakpoints configuration
   * @returns true if the stat is a priority stat
   */
  private isPriorityStat(
    statKey: string,
    breakpoints: AgentBreakpoints
  ): boolean {
    // First, check if statWeights is defined (new format)
    if (breakpoints.statWeights) {
      // Map breakpoint key back to stat type name for checking statWeights
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
        (statName) =>
          breakpoints.statWeights![statName] !== undefined &&
          breakpoints.statWeights![statName] > 0
      );
    }

    // Fall back to old priorityStats array format
    if (breakpoints.priorityStats && Array.isArray(breakpoints.priorityStats)) {
      // Map breakpoint key to stat type names that appear in priorityStats
      const statTypeMap: { [key: string]: string[] } = {
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

      const possibleStatNames = statTypeMap[statKey] || [];
      return possibleStatNames.some((statName) =>
        breakpoints.priorityStats.includes(statName)
      );
    }

    return false;
  }

  /**
   * Get human-readable priority stat names for feedback messages
   */
  private getPriorityStatDisplayNames(breakpoints: AgentBreakpoints): string[] {
    const displayNames: string[] = [];

    // Map internal stat names to display names
    const statDisplayMap: { [key: string]: string } = {
      'CRIT_Rate': 'CRIT Rate',
      'CRIT_DMG': 'CRIT DMG',
      'ATK%': 'ATK%',
      'ATK': 'ATK',
      'HP%': 'HP%',
      'HP': 'HP',
      'DEF%': 'DEF%',
      'DEF': 'DEF',
      'Anomaly_Proficiency': 'Anomaly Prof',
      'Anomaly_Mastery': 'Anomaly Mastery',
      'PEN': 'PEN',
      'PEN_Ratio': 'PEN Ratio',
      'Impact': 'Impact',
      'Energy_Regen': 'Energy Regen',
    };

    // Check statWeights first (new format)
    if (breakpoints.statWeights) {
      // Sort by weight (highest first) and take top stats
      const sortedStats = Object.entries(breakpoints.statWeights)
        .filter(([_, weight]) => weight > 0)
        .sort((a, b) => b[1] - a[1]);

      sortedStats.forEach(([stat, _]) => {
        const displayName = statDisplayMap[stat];
        if (displayName && !displayNames.includes(displayName)) {
          displayNames.push(displayName);
        }
      });
    }
    // Fall back to priorityStats array (old format)
    else if (breakpoints.priorityStats && Array.isArray(breakpoints.priorityStats)) {
      breakpoints.priorityStats.forEach(stat => {
        const displayName = statDisplayMap[stat];
        if (displayName && !displayNames.includes(displayName)) {
          displayNames.push(displayName);
        }
      });
    }

    return displayNames;
  }

  /**
   * Get the weight for a stat from breakpoints config
   * Returns 1.0 if stat is in priorityStats, or the actual weight from statWeights
   */
  private getStatWeight(statKey: string, breakpoints: AgentBreakpoints): number {
    // Map breakpoint key to statWeights key
    const statKeyMap: { [key: string]: string[] } = {
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

    const possibleKeys = statKeyMap[statKey] || [];

    // Check statWeights first
    if (breakpoints.statWeights) {
      for (const key of possibleKeys) {
        if (breakpoints.statWeights[key] !== undefined) {
          return breakpoints.statWeights[key];
        }
      }
    }

    // Fall back to priorityStats (all weighted 1.0)
    if (breakpoints.priorityStats && Array.isArray(breakpoints.priorityStats)) {
      for (const key of possibleKeys) {
        if (breakpoints.priorityStats.includes(key)) {
          return 1.0;
        }
      }
    }

    return 0;
  }

  /**
   * Get W-Engine stat contributions with reduced weight
   */
  private getWEngineStatContribution(
    wEngine?: WEngine,
    wEngineLevel?: number
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
   * Calculate composite build score
   * Combines 4 components:
   * - Breakpoint Score (40%): Meeting stat breakpoints
   * - Disc Quality Score (30%): Average rating of equipped discs
   * - Stat Efficiency Score (20%): Bonus for exceeding optimal, penalty for waste
   * - Set Bonus Score (10%): Whether set effects align with agent needs
   *
   * W-Engine and Mindscape stats are included with 0.25x weight
   */
  calculateCompositeBuildScore(
    agentId: string,
    stats: BaseStats,
    equippedDiscs: Disc[],
    wEngine?: WEngine,
    wEngineLevel?: number,
    mindscapeLevel: number = 0,
    agentName?: string,
    agentRole?: string,
    agentElement?: string,
    agentLevel?: number,
    agentScoring?: { buffs: any[]; debuffs: any[]; dazeBonus: number },
    wengineScoring?: { buffs: any[]; debuffs: any[]; dazeBonus: number }
  ): { score: number; rating: BuildRating; breakdown: any } {
    const breakpoints = this.agentBreakpoints[agentId];

    if (!breakpoints) {
      return {
        score: 0,
        rating: BUILD_RATING_THRESHOLDS[BUILD_RATING_THRESHOLDS.length - 1],
        breakdown: { message: 'No breakpoints defined for this agent' },
      };
    }

    // Calculate weighted contributions from W-Engine and Mindscape
    const wEngineContribution = this.getWEngineStatContribution(
      wEngine,
      wEngineLevel
    );
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

    // Calculate each component using weighted stats
    const breakpointResult = this.calculateBuildScore(agentId, weightedStats);
    const breakpointScore = breakpointResult.score; // 0-100 percentage
    const discQualityScore = this.calculateDiscQualityScore(
      equippedDiscs,
      agentId
    ); // 0-100


    const statEfficiencyScore = this.calculateStatEfficiencyScore(
      weightedStats,
      breakpoints
    ); // 0-100

    const setBonusScore = this.calculateSetBonusScore(equippedDiscs, agentId); // 0-100

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
      setBonusScore * BUILD_SCORE_WEIGHTS.SET_BONUS +
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
        setBonusScore: Math.round(setBonusScore * 10) / 10,
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
    isWEngineSpecialtyMatch: boolean
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
    const discScores: Array<{ slot: string; score: number; grade: string }> = [];
    discSlots.forEach(slot => {
      const disc = equippedDiscs[slot];
      if (disc) {
        const scoreResult = this.calculateDiscScore(disc, agentId);
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

    // Check for CRIT Rate overcap (warn if over 100%)
    if (stats.critRate > 100) {
      feedback.push({
        priority: 'medium',
        category: 'stat',
        message: `CRIT Rate is ${Math.round(stats.critRate)}% - overcapped! You're wasting ${Math.round(stats.critRate - 100)}% CRIT Rate`,
        stat: 'critRate',
        currentValue: stats.critRate,
        targetValue: 100,
      });
    }

    // Build list of stats that need improvement (for disc suggestions)
    const statsNeedingImprovement: Array<{ stat: string; substatName: string; deficit: number; weight: number }> = [];

    Object.keys(breakpoints.breakpoints).forEach(statKey => {
      const breakpoint = breakpoints.breakpoints[statKey as keyof typeof breakpoints.breakpoints];
      const statInfo = statMapping[statKey];
      if (!statInfo || breakpoint.optimal === 0) return;

      const isPriority = this.isPriorityStat(statKey, breakpoints);
      const current = statInfo.value;
      const optimal = breakpoint.optimal;

      // Skip CRIT Rate if already at or above optimal OR 100% (only stat where excess hurts)
      if (statKey === 'critRate' && (current >= optimal || current >= 100)) return;

      // Calculate how far below optimal we are
      if (current < optimal && isPriority) {
        const deficit = optimal - current;
        const deficitPercent = deficit / optimal;
        // Get weight from statWeights if available
        const weight = this.getStatWeight(statKey, breakpoints);
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

    // Generate smart stat suggestions for disc feedback
    // Only suggest stats that haven't yet reached optimal breakpoints
    let neededSubstats = statsNeedingImprovement
      .slice(0, 3)
      .map(s => s.substatName);

    // No fallback - if all stats are at optimal, don't suggest any stats for improvement

    const statSuggestion = neededSubstats.length > 0
      ? ` - Suggestion: ${neededSubstats.join(', ')}`
      : '';

    // Analyze disc substats to find wasted rolls and give specific feedback
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

    // Analyze each disc's substats for wasted rolls
    const discAnalysis: Array<{
      slot: string;
      grade: string;
      score: number;
      wastedStats: string[];
      missingPriorityStats: string[];
    }> = [];

    discSlots.forEach(slot => {
      const disc = equippedDiscs[slot];
      if (!disc) return;

      const scoreResult = discScores.find(d => d.slot === slot);
      if (!scoreResult) return;

      const wastedStats: string[] = [];
      const presentStats: string[] = [];

      // Check each substat
      disc.subStats.forEach(sub => {
        const weightKey = substatToWeightKey[sub.type];
        presentStats.push(weightKey);

        // Get weight for this substat (0 = not valuable for this agent)
        let weight = 0;
        if (breakpoints.statWeights && weightKey) {
          weight = breakpoints.statWeights[weightKey] || 0;
        } else if (breakpoints.priorityStats) {
          weight = breakpoints.priorityStats.includes(weightKey) ? 1 : 0;
        }

        // Skip CRIT Rate check if overcapped - it's now a wasted stat
        if (sub.type === 'CRIT_Rate' && stats.critRate >= 100) {
          wastedStats.push('CRIT Rate');
        } else if (weight === 0) {
          // This substat has no value for this agent
          const displayName = sub.type.replace('_', ' ').replace('%', '%');
          wastedStats.push(displayName);
        }
      });

      // Find which priority stats are missing from this disc
      const missingPriorityStats: string[] = [];
      if (breakpoints.statWeights) {
        Object.entries(breakpoints.statWeights)
          .filter(([stat, weight]) => weight > 0)
          .filter(([stat]) => {
            // Skip CRIT Rate if at or above optimal OR 100% (only stat where excess hurts)
            if (stat === 'CRIT_Rate' && (stats.critRate >= breakpoints.breakpoints.critRate.optimal || stats.critRate >= 100)) return false;
            return true;
          })
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .forEach(([stat]) => {
            if (!presentStats.includes(stat)) {
              const displayName = stat.replace('_', ' ').replace('%', '%');
              missingPriorityStats.push(displayName);
            }
          });
      }

      discAnalysis.push({
        slot,
        grade: scoreResult.grade,
        score: scoreResult.score,
        wastedStats,
        missingPriorityStats,
      });
    });

    // Get top 3 priority stats for suggestions (used for all disc feedback)
    let topPriorityStats: string[] = [];
    if (breakpoints.statWeights) {
      topPriorityStats = Object.entries(breakpoints.statWeights)
        .filter(([stat, weight]) => {
          if (weight <= 0) return false;
          // Skip CRIT Rate if at or above optimal OR 100% (only stat where excess hurts)
          if (stat === 'CRIT_Rate' && (stats.critRate >= breakpoints.breakpoints.critRate.optimal || stats.critRate >= 100)) return false;
          return true;
        })
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([stat]) => stat.replace('_', ' '));
    }

    // Find discs rated D or F (high priority to replace)
    const terribleDiscs = discAnalysis.filter(d => d.grade === 'D' || d.grade === 'F');
    terribleDiscs.sort((a, b) => a.score - b.score);

    // Show up to 2 terrible discs with specific feedback
    terribleDiscs.slice(0, 2).forEach(disc => {
      let message = `Replace ${disc.slot.replace('Drive', 'Drive ')} disc (rated ${disc.grade})`;

      // Suggest priority stats that this disc is missing
      if (disc.missingPriorityStats.length > 0) {
        message += ` - Suggestion: ${disc.missingPriorityStats.slice(0, 3).join(', ')}`;
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
          message += ` - Suggestion: ${disc.missingPriorityStats.slice(0, 3).join(', ')}`;
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
          message += ` - Suggestion: ${disc.missingPriorityStats.slice(0, 3).join(', ')}`;
        }

        feedback.push({
          priority: 'low',
          category: 'disc',
          message,
        });
      });
    }

    // Check priority stats first (they matter more)
    Object.keys(breakpoints.breakpoints).forEach(statKey => {
      const breakpoint = breakpoints.breakpoints[statKey as keyof typeof breakpoints.breakpoints];
      const statInfo = statMapping[statKey];

      if (!statInfo || breakpoint.optimal === 0) return;

      const isPriority = this.isPriorityStat(statKey, breakpoints);
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

    // Sort by priority: high first, then medium, then low
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    feedback.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    // Limit to top 5 suggestions to avoid overwhelming the user
    return feedback.slice(0, 5);
  }
}
