// services/optimizer.service.ts
import { Injectable } from '@angular/core';
import { Agent, BaseStats, DiscSlot } from '../models/agent.model';
import { Disc } from '../models/disc.model';
import { WEngine } from '../models/wengine.model';
import { ScoringAlgorithm } from '../models/scoring.model';
import { StatCalculatorService } from './stat-calculator.service';
import { DiscService } from './disc.service';
import { calculateWeightedBuildScore } from '../utils/build-scoring.util';

export interface OptimizedBuild {
  discs: { [key in DiscSlot]?: Disc };
  stats: BaseStats;
  score: number;
  setBonus: string[];
}

export interface OptimizerConstraints {
  minCritRate?: number;
  minCritDmg?: number;
  minATK?: number;
  minHP?: number;
  minDEF?: number;
  preferredSets?: string[];
  maxResults?: number;
}

@Injectable({
  providedIn: 'root'
})
export class OptimizerService {

  constructor(
    private statCalculator: StatCalculatorService,
    private discService: DiscService
  ) {}

  optimizeBuilds(
    agent: Agent,
    level: number,
    wEngine: WEngine | null,
    mindscapeLevel: number,
    algorithm: ScoringAlgorithm,
    constraints: OptimizerConstraints = {},
    onProgress?: (progress: number, text: string) => void
  ): OptimizedBuild[] {
    const allDiscs = this.discService.getUnequippedDiscs();

    // Group discs by slot
    const discsBySlot: { [key in DiscSlot]: Disc[] } = {
      Drive1: this.filterDiscsBySlot(allDiscs, 'Drive1'),
      Drive2: this.filterDiscsBySlot(allDiscs, 'Drive2'),
      Drive3: this.filterDiscsBySlot(allDiscs, 'Drive3'),
      Drive4: this.filterDiscsBySlot(allDiscs, 'Drive4'),
      Drive5: this.filterDiscsBySlot(allDiscs, 'Drive5'),
      Drive6: this.filterDiscsBySlot(allDiscs, 'Drive6'),
    };

    // Filter based on preferred main stats if specified
    const slots: DiscSlot[] = ['Drive1', 'Drive2', 'Drive3', 'Drive4', 'Drive5', 'Drive6'];
    slots.forEach(slot => {
      const preferredMainStats = algorithm.mainStatPreferences[slot];
      if (preferredMainStats && preferredMainStats.length > 0) {
        discsBySlot[slot] = discsBySlot[slot].filter(disc =>
          preferredMainStats.includes(disc.mainStat.type)
        );
      }
    });

    // Calculate total combinations for progress tracking
    const totalCombinations = this.calculateTotalCombinations(discsBySlot);
    console.log(`Total combinations to evaluate: ${totalCombinations.toLocaleString()}`);

    if (totalCombinations > 1000000) {
      console.warn('Very large search space! Consider adding more filters.');
    }

    // Generate and evaluate all combinations
    const builds: OptimizedBuild[] = [];
    let evaluated = 0;

    // Use iterative approach for better performance
    this.generateCombinations(
      discsBySlot,
      agent,
      level,
      wEngine,
      mindscapeLevel,
      algorithm,
      constraints,
      (build) => {
        builds.push(build);
        evaluated++;

        if (evaluated % 1000 === 0 && onProgress) {
          const progress = (evaluated / totalCombinations) * 100;
          onProgress(progress, `Evaluated ${evaluated.toLocaleString()} builds...`);
        }
      }
    );

    // Sort by score (highest first)
    builds.sort((a, b) => b.score - a.score);

    // Return top N results
    const maxResults = constraints.maxResults || 100;
    const topBuilds = builds.slice(0, maxResults);

    if (onProgress) {
      onProgress(100, `Complete! Found ${builds.length} valid builds.`);
    }

    return topBuilds;
  }

  private filterDiscsBySlot(discs: Disc[], slot: DiscSlot): Disc[] {
    return discs.filter(d => d.slot === slot);
  }

  private calculateTotalCombinations(discsBySlot: { [key in DiscSlot]: Disc[] }): number {
    return Object.values(discsBySlot).reduce((total, discs) => {
      return total * Math.max(discs.length, 1);
    }, 1);
  }

  private generateCombinations(
    discsBySlot: { [key in DiscSlot]: Disc[] },
    agent: Agent,
    level: number,
    wEngine: WEngine | null,
    mindscapeLevel: number,
    algorithm: ScoringAlgorithm,
    constraints: OptimizerConstraints,
    onBuild: (build: OptimizedBuild) => void
  ): void {
    const slots: DiscSlot[] = ['Drive1', 'Drive2', 'Drive3', 'Drive4', 'Drive5', 'Drive6'];

    // Iterative combination generator with backtracking (replaces recursive approach)
    // This prevents stack overflow and eliminates unnecessary object spreading
    const currentDiscs: { [key in DiscSlot]?: Disc } = {};
    const indices: number[] = new Array(slots.length).fill(0);
    let slotIndex = 0;

    while (slotIndex >= 0) {
      const currentSlot = slots[slotIndex];
      const availableDiscs = discsBySlot[currentSlot];

      if (indices[slotIndex] < availableDiscs.length) {
        // Try next disc in this slot
        currentDiscs[currentSlot] = availableDiscs[indices[slotIndex]];

        if (slotIndex === slots.length - 1) {
          // We have a complete build, evaluate it
          const build = this.evaluateBuild(
            currentDiscs,
            agent,
            level,
            wEngine,
            mindscapeLevel,
            algorithm
          );

          if (this.meetsConstraints(build, constraints)) {
            onBuild(build);
          }

          // Move to next disc in current slot
          indices[slotIndex]++;
        } else {
          // Move to next slot
          slotIndex++;
          indices[slotIndex] = 0;
        }
      } else {
        // Backtrack: exhausted all discs in current slot
        delete currentDiscs[currentSlot];
        indices[slotIndex] = 0;
        slotIndex--;

        // If we backtracked, increment previous slot's index
        if (slotIndex >= 0) {
          indices[slotIndex]++;
        }
      }
    }
  }

  private evaluateBuild(
    discs: { [key in DiscSlot]?: Disc },
    agent: Agent,
    level: number,
    wEngine: WEngine | null,
    mindscapeLevel: number,
    algorithm: ScoringAlgorithm
  ): OptimizedBuild {
    // Calculate final stats
    const stats = this.statCalculator.calculateFinalStats(
      agent,
      level,
      wEngine,
      discs,
      mindscapeLevel
    );

    // Calculate score based on algorithm
    const score = calculateWeightedBuildScore(
      stats,
      discs,
      algorithm,
      (d) => this.statCalculator.getSetBonuses(d)
    );

    // Get active set bonuses
    const setBonus = this.statCalculator.getSetBonuses(discs);

    return {
      discs,
      stats,
      score,
      setBonus
    };
  }

  private meetsConstraints(build: OptimizedBuild, constraints: OptimizerConstraints): boolean {
    if (constraints.minCritRate && build.stats.critRate < constraints.minCritRate) {
      return false;
    }
    if (constraints.minCritDmg && build.stats.critDmg < constraints.minCritDmg) {
      return false;
    }
    if (constraints.minATK && build.stats.atk < constraints.minATK) {
      return false;
    }
    if (constraints.minHP && build.stats.hp < constraints.minHP) {
      return false;
    }
    if (constraints.minDEF && build.stats.def < constraints.minDEF) {
      return false;
    }
    if (constraints.preferredSets && constraints.preferredSets.length > 0) {
      const hasPreferredSet = build.setBonus.some(bonus =>
        constraints.preferredSets!.some(preferred => bonus.includes(preferred))
      );
      if (!hasPreferredSet) {
        return false;
      }
    }

    return true;
  }

  // Optimized version for large disc collections
  optimizeBuildsEfficient(
    agent: Agent,
    level: number,
    wEngine: WEngine | null,
    mindscapeLevel: number,
    algorithm: ScoringAlgorithm,
    constraints: OptimizerConstraints = {},
    onProgress?: (progress: number, text: string) => void
  ): OptimizedBuild[] {
    const allDiscs = this.discService.getUnequippedDiscs();

    // Pre-filter discs aggressively
    const discsBySlot: { [key in DiscSlot]: Disc[] } = {
      Drive1: [],
      Drive2: [],
      Drive3: [],
      Drive4: [],
      Drive5: [],
      Drive6: [],
    };

    const slots: DiscSlot[] = ['Drive1', 'Drive2', 'Drive3', 'Drive4', 'Drive5', 'Drive6'];

    slots.forEach(slot => {
      let slotDiscs = this.filterDiscsBySlot(allDiscs, slot);

      // Filter by preferred main stats
      const preferredMainStats = algorithm.mainStatPreferences[slot];
      if (preferredMainStats && preferredMainStats.length > 0) {
        slotDiscs = slotDiscs.filter(disc =>
          preferredMainStats.includes(disc.mainStat.type)
        );
      }

      // Score and sort discs, keep only top 20 per slot
      slotDiscs = slotDiscs
        .map(disc => ({
          disc,
          score: this.discService.scoreDisc(disc, algorithm)
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
        .map(item => item.disc);

      discsBySlot[slot] = slotDiscs;
    });

    // Now run optimization with filtered discs
    return this.optimizeBuilds(
      agent,
      level,
      wEngine,
      mindscapeLevel,
      algorithm,
      constraints,
      onProgress
    );
  }
}
