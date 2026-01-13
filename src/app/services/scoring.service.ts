import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Disc } from '../models/disc.model';
import { BaseStats, WEngine } from '../models/agent.model';
import {
  SUBSTAT_WEIGHTS,
  ROLE_WEIGHT_MULTIPLIERS,
  MAIN_STAT_BONUS,
  DISC_RATING_THRESHOLDS,
  BUILD_RATING_THRESHOLDS,
  BAD_FLAT_STATS,
  FLAT_STAT_PENALTY_PER_ADDITIONAL,
  EXTERNAL_STAT_WEIGHTS,
  BUILD_SCORE_WEIGHTS,
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
  statWeights: { [statType: string]: number };
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
  providedIn: 'root'
})
export class ScoringService {
  private agentBreakpoints: { [agentId: string]: AgentBreakpoints } = {};
  private breakpointsLoaded = false;
  private discSetData: { [setId: string]: DiscSetData } = {};
  private mindscapeData: MindscapeData | null = null;
  private dataLoaded = false;

  constructor(private http: HttpClient) {
    this.loadAllData();
  }

  /**
   * Load all data needed for scoring
   */
  private async loadAllData() {
    await Promise.all([
      this.loadAgentBreakpoints(),
      this.loadDiscSetData(),
      this.loadMindscapeData()
    ]);
    this.dataLoaded = true;
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
   * Load disc set data from equipment JSON files
   */
  private async loadDiscSetData() {
    try {
      // Load all disc set files (31000-33600)
      const setIds = [
        '31000', '31100', '31200', '31300', '31400', '31500', '31600', '31800', '31900',
        '32200', '32300', '32400', '32500', '32600', '32700', '32800', '32900',
        '33000', '33100', '33200', '33300', '33400', '33500', '33600'
      ];

      const promises = setIds.map(id =>
        firstValueFrom(
          this.http.get<DiscSetData>(`/assets/data/equipment/${id}.json`)
        ).catch(() => null) // Ignore errors for missing files
      );

      const results = await Promise.all(promises);
      results.forEach((data, index) => {
        if (data) {
          this.discSetData[setIds[index]] = data;
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
        this.http.get<MindscapeData>('/assets/data/mindscape-stats.json')
      );
      console.log('Loaded mindscape data for scoring');
    } catch (error) {
      console.error('Failed to load mindscape data:', error);
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

    // Use agent-specific weights directly from breakpoints
    let weights: { [key: string]: number } = {};

    if (agentId && this.agentBreakpoints[agentId]?.statWeights) {
      // Check if this is a hybrid agent and we have equipped discs to analyze
      const detectedBuild = equippedDiscs ? this.detectBuildType(equippedDiscs) : null;

      if (detectedBuild) {
        const hybridWeights = this.getHybridBuildWeights(agentId, detectedBuild);
        if (hybridWeights) {
          // Use detected build-specific weights directly
          weights = hybridWeights;
          breakdown.detectedBuild = detectedBuild;
        } else {
          // Not a hybrid agent, use standard agent weights directly
          weights = this.agentBreakpoints[agentId].statWeights;
        }
      } else {
        // Use standard agent weights directly
        weights = this.agentBreakpoints[agentId].statWeights;
      }
    } else {
      // No agent specified - use default weights from SUBSTAT_WEIGHTS as fallback
      weights = SUBSTAT_WEIGHTS;
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

  /**
   * Calculate disc quality score (average of all equipped discs)
   * Component 2 of composite build rating (30% weight)
   */
  private calculateDiscQualityScore(equippedDiscs: Disc[], agentId: string): number {
    if (!equippedDiscs || equippedDiscs.length === 0) {
      return 0;
    }

    // Convert disc ratings to numeric scores
    const ratingToScore: { [key: string]: number } = {
      'SSS': 100,
      'SS': 90,
      'S': 80,
      'A': 70,
      'B': 60,
      'C': 50,
      'D': 40,
      'F': 30
    };

    let totalScore = 0;
    equippedDiscs.forEach(disc => {
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
    agentId: string,
    stats: BaseStats,
    breakpoints: AgentBreakpoints
  ): number {
    let efficiencyScore = 50; // Start at 50 (neutral)

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

    Object.keys(breakpoints.breakpoints).forEach(statKey => {
      const breakpoint = breakpoints.breakpoints[statKey as keyof typeof breakpoints.breakpoints];
      const currentValue = statMapping[statKey] || 0;
      const weight = breakpoints.statWeights[statKey] || 0;

      if (breakpoint.optimal > 0) {
        // Stat matters - check if we exceed optimal
        if (currentValue > breakpoint.optimal) {
          const excessPercentage = ((currentValue - breakpoint.optimal) / breakpoint.optimal) * 100;
          // Diminishing returns: first 10% excess = +5 points, next 10% = +3, next 10% = +1
          if (excessPercentage <= 10) {
            efficiencyScore += excessPercentage * 0.5;
          } else if (excessPercentage <= 20) {
            efficiencyScore += 5 + (excessPercentage - 10) * 0.3;
          } else {
            efficiencyScore += 5 + 3 + (excessPercentage - 20) * 0.1;
          }
        }
      } else {
        // Stat doesn't matter (optimal = 0) - penalize heavy investment
        if (weight === 0 && currentValue > 0) {
          // Heavy penalty for investing in completely useless stats
          efficiencyScore -= Math.min(10, currentValue * 0.1);
        }
      }
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
    equippedDiscs.forEach(disc => {
      if (disc.set) {
        setCounts[disc.set] = (setCounts[disc.set] || 0) + 1;
      }
    });

    let setBonusScore = 0;
    let activeSets = 0;

    // Check each set for 2pc and 4pc bonuses
    Object.keys(setCounts).forEach(setName => {
      const count = setCounts[setName];

      // Find the disc set data by name
      const setData = Object.values(this.discSetData).find(s => s.Name === setName);
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

        properties.forEach(prop => {
          // Map property names to breakpoint keys
          const statKey = this.mapStatNameToBreakpointKey(prop.Name);
          if (statKey) {
            const breakpoint = breakpoints.breakpoints[statKey as keyof typeof breakpoints.breakpoints];
            const weight = breakpoints.statWeights[statKey] || 0;

            if (breakpoint && breakpoint.optimal > 0 && weight > 0) {
              // Good set effect - aligns with agent needs
              setBonusScore += weight * 10; // Scale by weight
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
      'ATK': 'atk',
      'HP%': 'hp',
      'HP': 'hp',
      'DEF%': 'def',
      'DEF': 'def',
      'CRIT_Rate': 'critRate',
      'CRIT_DMG': 'critDmg',
      'Anomaly_Proficiency': 'anomalyProficiency',
      'Anomaly_Mastery': 'anomalyMastery',
      'PEN': 'pen',
      'PEN_Ratio': 'penRatio',
      'Impact': 'impact',
      'Energy_Regen': 'energyRegen'
    };

    return mapping[statName] || null;
  }

  /**
   * Get W-Engine stat contributions with reduced weight
   */
  private getWEngineStatContribution(wEngine?: WEngine, wEngineLevel?: number): Partial<BaseStats> {
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
  private getMindscapeStatContribution(agentId: string, mindscapeLevel: number): Partial<BaseStats> {
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
        bonuses.forEach(bonus => {
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
              contribution.energyRegen = (contribution.energyRegen || 0) + value;
              break;
            case 'Impact':
              contribution.impact = (contribution.impact || 0) + value;
              break;
            case 'Anomaly_Proficiency':
              contribution.anomalyProficiency = (contribution.anomalyProficiency || 0) + value;
              break;
            case 'Anomaly_Mastery':
              contribution.anomalyMastery = (contribution.anomalyMastery || 0) + value;
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
    Object.keys(wEngineContribution).forEach(key => {
      const statKey = key as keyof BaseStats;
      weightedStats[statKey] = (weightedStats[statKey] || 0) + (wEngineContribution[statKey] || 0);
    });

    // Apply Mindscape contributions
    Object.keys(mindscapeContribution).forEach(key => {
      const statKey = key as keyof BaseStats;
      weightedStats[statKey] = (weightedStats[statKey] || 0) + (mindscapeContribution[statKey] || 0);
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
    mindscapeLevel: number = 0
  ): { score: number, rating: BuildRating, breakdown: any } {
    const breakpoints = this.agentBreakpoints[agentId];

    if (!breakpoints) {
      return {
        score: 0,
        rating: BUILD_RATING_THRESHOLDS[BUILD_RATING_THRESHOLDS.length - 1],
        breakdown: { message: 'No breakpoints defined for this agent' }
      };
    }

    // Calculate weighted contributions from W-Engine and Mindscape
    const wEngineContribution = this.getWEngineStatContribution(wEngine, wEngineLevel);
    const mindscapeContribution = this.getMindscapeStatContribution(agentId, mindscapeLevel);

    // Apply weighted external stats to base stats
    const weightedStats = this.applyWeightedStats(stats, wEngineContribution, mindscapeContribution);

    // Calculate each component using weighted stats
    const breakpointResult = this.calculateBuildScore(agentId, weightedStats);
    const breakpointScore = breakpointResult.score; // 0-100 percentage

    const discQualityScore = this.calculateDiscQualityScore(equippedDiscs, agentId); // 0-100

    const statEfficiencyScore = this.calculateStatEfficiencyScore(
      agentId,
      weightedStats,
      breakpoints
    ); // 0-100

    const setBonusScore = this.calculateSetBonusScore(equippedDiscs, agentId); // 0-100

    // Combine with weights
    const compositeScore =
      breakpointScore * BUILD_SCORE_WEIGHTS.BREAKPOINT +
      discQualityScore * BUILD_SCORE_WEIGHTS.DISC_QUALITY +
      statEfficiencyScore * BUILD_SCORE_WEIGHTS.STAT_EFFICIENCY +
      setBonusScore * BUILD_SCORE_WEIGHTS.SET_BONUS;

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
        wEngineContribution: wEngineContribution,
        mindscapeContribution: mindscapeContribution,
        componentWeights: BUILD_SCORE_WEIGHTS
      }
    };
  }
}
