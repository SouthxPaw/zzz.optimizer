import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Disc } from '../models/agent.model';
import { BaseStats } from '../models/agent.model';
import {
  SUBSTAT_WEIGHTS,
  ROLE_WEIGHT_MULTIPLIERS,
  MAIN_STAT_BONUS,
  DISC_RATING_THRESHOLDS,
  BUILD_RATING_THRESHOLDS,
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
   * Calculate disc score based on substats and main stat
   * Uses agent-specific weights from breakpoints config
   */
  calculateDiscScore(disc: Disc, agentId?: string): { score: number, rating: DiscRating, breakdown: any } {
    let totalPoints = 0;
    const breakdown = {
      mainStatPoints: 0,
      subStatPoints: 0,
      details: [] as Array<{ stat: string, value: number, points: number }>
    };

    // Get agent-specific weights if available, otherwise use base weights
    let weights: { [key: string]: number } = SUBSTAT_WEIGHTS;
    if (agentId && this.agentBreakpoints[agentId]?.discWeights) {
      // Use agent-specific disc weights
      const agentWeights = this.agentBreakpoints[agentId].discWeights;
      weights = { ...SUBSTAT_WEIGHTS };

      // Override with agent-specific weights
      Object.keys(agentWeights).forEach(statType => {
        weights[statType] = agentWeights[statType];
      });
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
