import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Disc } from '../models/disc.model';
import { BaseStats } from '../models/agent.model';
import {
  SUBSTAT_WEIGHTS,
  ROLE_WEIGHT_MULTIPLIERS,
  MAIN_STAT_BONUS,
  DISC_RATING_THRESHOLDS,
  BUILD_RATING_THRESHOLDS,
  BAD_FLAT_STATS,
  FLAT_STAT_PENALTY_PER_ADDITIONAL,
  DiscRating,
  BuildRating
} from '../constants/disc-scoring';

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
  discWeights: { [statType: string]: number };
}

@Injectable({
  providedIn: 'root'
})
export class ScoringService {
  private agentBreakpoints: { [agentId: string]: AgentBreakpoints } = {};
  private breakpointsLoaded = false;

  constructor(private http: HttpClient) {
    this.loadAgentBreakpoints();
  }

  /**
   * Load agent breakpoints from JSON file
   */
  private async loadAgentBreakpoints() {
    try {
      const data = await firstValueFrom(
        this.http.get<any>('/assets/data/agent-breakpoints.json')
      );
      this.agentBreakpoints = data.agents || {};
      this.breakpointsLoaded = true;
      console.log('Loaded agent breakpoints for scoring');
    } catch (error) {
      console.error('Failed to load agent breakpoints:', error);
    }
  }

  /**
   * Detect build type from equipped discs for hybrid agents
   * Returns 'crit' or 'anomaly' based on equipped disc investment
   */
  private detectBuildType(equippedDiscs: Disc[]): 'crit' | 'anomaly' | null {
    if (!equippedDiscs || equippedDiscs.length === 0) {
      return null;
    }

    let critScore = 0;
    let anomalyScore = 0;

    equippedDiscs.forEach(disc => {
      // Check main stats (heavily weighted)
      if (disc.mainStat.type === 'CRIT_Rate' || disc.mainStat.type === 'CRIT_DMG') {
        critScore += 5;
      } else if (disc.mainStat.type === 'Anomaly_Proficiency' || disc.mainStat.type === 'Anomaly_Mastery') {
        anomalyScore += 5;
      }

      // Check substats
      disc.subStats.forEach(sub => {
        if (sub.type === 'CRIT_Rate' || sub.type === 'CRIT_DMG') {
          critScore += sub.value * 0.1; // Normalize the contribution
        } else if (sub.type === 'Anomaly_Proficiency' || sub.type === 'Anomaly_Mastery') {
          anomalyScore += sub.value * 0.1;
        }
      });
    });

    // If neither has significant investment, return null (use default weights)
    if (critScore < 1 && anomalyScore < 1) {
      return null;
    }

    return critScore > anomalyScore ? 'crit' : 'anomaly';
  }

  /**
   * Get hybrid build weights for agents that can build either Crit or Anomaly
   * Based on detected build from equipped discs
   */
  private getHybridBuildWeights(agentId: string, buildType: 'crit' | 'anomaly'): { [statType: string]: number } | null {
    const hybridAgents: { [key: string]: { crit: { [key: string]: number }, anomaly: { [key: string]: number } } } = {
      '1071': { // Caesar
        crit: {
          'CRIT_Rate': 2,
          'CRIT_DMG': 2,
          'ATK%': 1.5,
          'ATK': 0.5,
          'HP%': 0.5,
          'HP': 0.2,
          'DEF%': 0.5,
          'DEF': 0.2,
          'PEN_Ratio': 0.5,
          'Energy_Regen': 0,
          'Anomaly_Proficiency': 0,
          'Anomaly_Mastery': 0,
          'Impact': 1.5,
          'PEN': 0
        },
        anomaly: {
          'CRIT_Rate': 0,
          'CRIT_DMG': 0,
          'ATK%': 1.5,
          'ATK': 0.5,
          'HP%': 0.5,
          'HP': 0.2,
          'DEF%': 0.5,
          'DEF': 0.2,
          'PEN_Ratio': 1,
          'Energy_Regen': 0,
          'Anomaly_Proficiency': 2,
          'Anomaly_Mastery': 1.5,
          'Impact': 1.5,
          'PEN': 0.5
        }
      },
      '1031': { // Nicole
        crit: {
          'CRIT_Rate': 1.5,
          'CRIT_DMG': 1.5,
          'ATK%': 1,
          'ATK': 0.5,
          'HP%': 0,
          'HP': 0,
          'DEF%': 1,
          'DEF': 0.5,
          'PEN_Ratio': 0.5,
          'Energy_Regen': 0.5,
          'Anomaly_Proficiency': 0,
          'Anomaly_Mastery': 0,
          'Impact': 0,
          'PEN': 0
        },
        anomaly: {
          'CRIT_Rate': 0,
          'CRIT_DMG': 0,
          'ATK%': 1,
          'ATK': 0.5,
          'HP%': 0,
          'HP': 0,
          'DEF%': 1,
          'DEF': 0.5,
          'PEN_Ratio': 1,
          'Energy_Regen': 0.5,
          'Anomaly_Proficiency': 2,
          'Anomaly_Mastery': 1.5,
          'Impact': 0,
          'PEN': 0.5
        }
      },
      '1311': { // Astra Yao
        crit: {
          'CRIT_Rate': 1.5,
          'CRIT_DMG': 1.5,
          'ATK%': 1,
          'ATK': 0.5,
          'HP%': 1,
          'HP': 0.5,
          'DEF%': 0,
          'DEF': 0,
          'PEN_Ratio': 0.5,
          'Energy_Regen': 1,
          'Anomaly_Proficiency': 0,
          'Anomaly_Mastery': 0,
          'Impact': 0,
          'PEN': 0
        },
        anomaly: {
          'CRIT_Rate': 0,
          'CRIT_DMG': 0,
          'ATK%': 1,
          'ATK': 0.5,
          'HP%': 1,
          'HP': 0.5,
          'DEF%': 0,
          'DEF': 0,
          'PEN_Ratio': 1,
          'Energy_Regen': 1,
          'Anomaly_Proficiency': 2,
          'Anomaly_Mastery': 1.5,
          'Impact': 0,
          'PEN': 0.5
        }
      }
    };

    return hybridAgents[agentId]?.[buildType] || null;
  }

  /**
   * Calculate disc score based on substats and main stat
   * Uses agent-specific weights from breakpoints config
   * For hybrid agents, detects build type from equippedDiscs
   */
  calculateDiscScore(disc: Disc, agentId?: string, equippedDiscs?: Disc[]): { score: number, rating: DiscRating, breakdown: any } {
    let totalPoints = 0;
    const breakdown = {
      mainStatPoints: 0,
      subStatPoints: 0,
      detectedBuild: null as string | null,
      details: [] as Array<{ stat: string, value: number, points: number }>
    };

    // Get agent-specific weights if available, otherwise use base weights
    let weights: { [key: string]: number } = SUBSTAT_WEIGHTS;
    if (agentId && this.agentBreakpoints[agentId]?.discWeights) {
      // Check if this is a hybrid agent and we have equipped discs to analyze
      const detectedBuild = equippedDiscs ? this.detectBuildType(equippedDiscs) : null;

      if (detectedBuild) {
        const hybridWeights = this.getHybridBuildWeights(agentId, detectedBuild);
        if (hybridWeights) {
          // Use detected build-specific weights
          weights = hybridWeights;
          breakdown.detectedBuild = detectedBuild;
        } else {
          // Not a hybrid agent, use standard agent weights
          const agentWeights = this.agentBreakpoints[agentId].discWeights;
          weights = { ...SUBSTAT_WEIGHTS };
          Object.keys(agentWeights).forEach(statType => {
            weights[statType] = agentWeights[statType];
          });
        }
      } else {
        // No build detected or no equipped discs, use standard agent weights
        const agentWeights = this.agentBreakpoints[agentId].discWeights;
        weights = { ...SUBSTAT_WEIGHTS };
        Object.keys(agentWeights).forEach(statType => {
          weights[statType] = agentWeights[statType];
        });
      }
    }

    // Award points for optimal main stat
    const mainStatBonus = MAIN_STAT_BONUS[disc.slot]?.[disc.mainStat.type] || 0;
    breakdown.mainStatPoints = mainStatBonus;
    totalPoints += mainStatBonus;

    // Calculate points from substats using agent-specific weights
    disc.subStats.forEach(substat => {
      const weight = weights[substat.type] || 0;
      const points = substat.value * weight;

      breakdown.subStatPoints += points;
      breakdown.details.push({
        stat: substat.type,
        value: substat.value,
        points: points
      });

      totalPoints += points;
    });

    // Apply penalty for multiple "bad" flat stats (HP, ATK, DEF)
    const badFlatCount = disc.subStats.filter(sub => BAD_FLAT_STATS.includes(sub.type)).length;
    if (badFlatCount > 1) {
      const penalty = (badFlatCount - 1) * FLAT_STAT_PENALTY_PER_ADDITIONAL;
      totalPoints -= penalty;
      breakdown.details.push({
        stat: 'Bad Flat Penalty',
        value: badFlatCount,
        points: -penalty
      });
    }

    // Determine rating based on total points
    const rating = this.getDiscRating(totalPoints);

    return {
      score: Math.round(totalPoints * 10) / 10,
      rating: rating,
      breakdown: breakdown
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
  calculateBuildScore(agentId: string, stats: BaseStats): { score: number, rating: BuildRating, breakdown: any } {
    const breakpoints = this.agentBreakpoints[agentId];

    if (!breakpoints) {
      // No breakpoints defined for this agent yet
      return {
        score: 0,
        rating: BUILD_RATING_THRESHOLDS[BUILD_RATING_THRESHOLDS.length - 1],
        breakdown: { message: 'No breakpoints defined for this agent' }
      };
    }

    const breakdown = {
      totalBreakpoints: 0,
      metBreakpoints: 0,
      statDetails: [] as Array<{
        stat: string,
        current: number,
        min: number,
        optimal: number,
        metMin: boolean,
        metOptimal: boolean,
        isPriority: boolean
      }>
    };

    // Map BaseStats to breakpoint keys
    const statMapping: { [key: string]: number } = {
      'hp': stats.hp,
      'atk': stats.atk,
      'def': stats.def,
      'impact': stats.impact,
      'anomalyMastery': stats.anomalyMastery,
      'critRate': stats.critRate,
      'critDmg': stats.critDmg,
      'anomalyProficiency': stats.anomalyProficiency,
      'pen': stats.pen,
      'penRatio': stats.penRatio,
      'energyRegen': stats.energyRegen
    };

    // Check each breakpoint
    Object.keys(breakpoints.breakpoints).forEach(statKey => {
      const breakpoint = breakpoints.breakpoints[statKey as keyof typeof breakpoints.breakpoints];
      const currentValue = statMapping[statKey] || 0;
      const isPriority = breakpoints.priorityStats.includes(statKey);

      // Only count breakpoints where optimal > 0 (meaning this stat matters)
      if (breakpoint.optimal > 0) {
        breakdown.totalBreakpoints++;

        const metMin = currentValue >= breakpoint.min;
        const metOptimal = currentValue >= breakpoint.optimal;

        // Award points based on meeting breakpoints
        // Priority stats are weighted more heavily
        if (metOptimal) {
          breakdown.metBreakpoints += isPriority ? 1.5 : 1.0;
        } else if (metMin) {
          breakdown.metBreakpoints += isPriority ? 0.75 : 0.5;
        }

        breakdown.statDetails.push({
          stat: statKey,
          current: currentValue,
          min: breakpoint.min,
          optimal: breakpoint.optimal,
          metMin: metMin,
          metOptimal: metOptimal,
          isPriority: isPriority
        });
      }
    });

    // Calculate percentage of breakpoints met
    const breakpointsMetPercentage = breakdown.totalBreakpoints > 0
      ? (breakdown.metBreakpoints / breakdown.totalBreakpoints) * 100
      : 0;

    // Determine rating based on percentage
    const rating = this.getBuildRating(breakpointsMetPercentage);

    return {
      score: Math.round(breakpointsMetPercentage * 10) / 10,
      rating: rating,
      breakdown: breakdown
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
}
