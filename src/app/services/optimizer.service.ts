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
    onProgress?: (progress: number, text: string) => void,
    options: {
      topDiscsPerSlot?: number;
      minDiscLevel?: number;
      enablePruning?: boolean;
    } = {}
  ): OptimizedBuild[] {
    // OPTIMIZATION 2: Aggressive pre-filtering with configurable limits
    const topDiscsPerSlot = options.topDiscsPerSlot ?? 10; // Down from 20
    const minDiscLevel = options.minDiscLevel ?? 12; // Only consider leveled discs
    const enablePruning = options.enablePruning ?? true;

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

    // OPTIMIZATION 6: Pre-compute all disc scores once
    const discScoreCache = new Map<string, number>();
    allDiscs.forEach(disc => {
      const score = this.simpleScoreDisc(disc, algorithm);
      discScoreCache.set(disc.uid, score);
    });

    slots.forEach(slot => {
      let slotDiscs = this.filterDiscsBySlot(allDiscs, slot);

      // Filter by minimum level (skip low-level discs)
      if (minDiscLevel > 0) {
        slotDiscs = slotDiscs.filter(disc => disc.level >= minDiscLevel);
      }

      // Filter by preferred main stats FIRST (most effective filter)
      const preferredMainStats = algorithm.mainStatPreferences[slot];
      if (preferredMainStats && preferredMainStats.length > 0) {
        slotDiscs = slotDiscs.filter(disc =>
          preferredMainStats.includes(disc.mainStat.type)
        );
      }

      // Score and sort discs, keep only top N per slot
      // Use pre-computed scores from cache
      slotDiscs = slotDiscs
        .map(disc => ({
          disc,
          score: discScoreCache.get(disc.uid) || 0
        }))
        .filter(item => item.score > 0) // Exclude discs with 0 score
        .sort((a, b) => b.score - a.score)
        .slice(0, topDiscsPerSlot)
        .map(item => item.disc);

      discsBySlot[slot] = slotDiscs;
    });

    const totalCombinations = this.calculateTotalCombinations(discsBySlot);
    console.log(`Optimized filtering: ${totalCombinations.toLocaleString()} combinations (${topDiscsPerSlot} discs/slot, min level ${minDiscLevel})`);

    // Use optimized generation with pruning if enabled
    if (enablePruning && totalCombinations > 10000) {
      return this.optimizeBuildsWithPruning(
        discsBySlot,
        discScoreCache,
        agent,
        level,
        wEngine,
        mindscapeLevel,
        algorithm,
        constraints,
        onProgress
      );
    }

    // For smaller search spaces, use standard algorithm
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

  /**
   * OPTIMIZATION 1 & 4: Optimized build generation with branch-and-bound pruning and top-K heap
   */
  private optimizeBuildsWithPruning(
    discsBySlot: { [key in DiscSlot]: Disc[] },
    discScoreCache: Map<string, number>,
    agent: Agent,
    level: number,
    wEngine: WEngine | null,
    mindscapeLevel: number,
    algorithm: ScoringAlgorithm,
    constraints: OptimizerConstraints,
    onProgress?: (progress: number, text: string) => void
  ): OptimizedBuild[] {
    const slots: DiscSlot[] = ['Drive1', 'Drive2', 'Drive3', 'Drive4', 'Drive5', 'Drive6'];
    const maxResults = constraints.maxResults || 100;

    // OPTIMIZATION 4: Use top-K heap instead of storing all builds
    const topBuilds: OptimizedBuild[] = [];
    let worstTopScore = 0;

    // OPTIMIZATION 1: Track best score for pruning
    let bestScore = 0;
    let evaluatedCount = 0;
    let prunedCount = 0;

    const currentDiscs: { [key in DiscSlot]?: Disc } = {};
    const indices: number[] = new Array(slots.length).fill(0);
    let slotIndex = 0;

    const totalCombinations = this.calculateTotalCombinations(discsBySlot);

    while (slotIndex >= 0) {
      const currentSlot = slots[slotIndex];
      const availableDiscs = discsBySlot[currentSlot];

      if (indices[slotIndex] < availableDiscs.length) {
        currentDiscs[currentSlot] = availableDiscs[indices[slotIndex]];

        // OPTIMIZATION 1: Early termination - estimate upper bound
        if (slotIndex < slots.length - 1) {
          const upperBound = this.estimateUpperBound(
            currentDiscs,
            discsBySlot,
            discScoreCache,
            slots,
            slotIndex
          );

          // Prune if upper bound can't beat worst in top-K (with 5% tolerance)
          if (topBuilds.length >= maxResults && upperBound < worstTopScore * 0.95) {
            indices[slotIndex]++;
            prunedCount++;
            continue;
          }
        }

        if (slotIndex === slots.length - 1) {
          // Evaluate complete build
          const build = this.evaluateBuild(
            currentDiscs,
            agent,
            level,
            wEngine,
            mindscapeLevel,
            algorithm
          );

          if (this.meetsConstraints(build, constraints)) {
            // OPTIMIZATION 4: Insert into top-K heap
            if (topBuilds.length < maxResults) {
              topBuilds.push(build);
              topBuilds.sort((a, b) => b.score - a.score);
              worstTopScore = topBuilds[topBuilds.length - 1].score;
            } else if (build.score > worstTopScore) {
              topBuilds[topBuilds.length - 1] = build;
              topBuilds.sort((a, b) => b.score - a.score);
              worstTopScore = topBuilds[topBuilds.length - 1].score;
            }

            bestScore = Math.max(bestScore, build.score);
          }

          evaluatedCount++;

          // Progress reporting
          if (evaluatedCount % 1000 === 0 && onProgress) {
            const progress = (evaluatedCount / totalCombinations) * 100;
            onProgress(progress, `Evaluated ${evaluatedCount.toLocaleString()} / ${totalCombinations.toLocaleString()} (pruned ${prunedCount.toLocaleString()})`);
          }

          indices[slotIndex]++;
        } else {
          slotIndex++;
          indices[slotIndex] = 0;
        }
      } else {
        delete currentDiscs[currentSlot];
        indices[slotIndex] = 0;
        slotIndex--;
        if (slotIndex >= 0) {
          indices[slotIndex]++;
        }
      }
    }

    console.log(`Optimization complete: Evaluated ${evaluatedCount}, Pruned ${prunedCount} (${((prunedCount / (evaluatedCount + prunedCount)) * 100).toFixed(1)}% reduction)`);

    if (onProgress) {
      onProgress(100, `Complete! Found ${topBuilds.length} builds (evaluated ${evaluatedCount.toLocaleString()}, pruned ${prunedCount.toLocaleString()})`);
    }

    return topBuilds;
  }

  /**
   * OPTIMIZATION 1: Estimate upper bound for branch-and-bound pruning
   */
  private estimateUpperBound(
    currentDiscs: { [key in DiscSlot]?: Disc },
    discsBySlot: { [key in DiscSlot]: Disc[] },
    discScoreCache: Map<string, number>,
    slots: DiscSlot[],
    currentSlotIndex: number
  ): number {
    let upperBound = 0;

    // Add scores from already-selected discs
    Object.values(currentDiscs).forEach(disc => {
      if (disc) {
        upperBound += discScoreCache.get(disc.uid) || 0;
      }
    });

    // Add BEST possible scores from remaining slots
    for (let i = currentSlotIndex + 1; i < slots.length; i++) {
      const slot = slots[i];
      const discsInSlot = discsBySlot[slot];

      if (discsInSlot.length > 0) {
        // Find best disc in this slot (they're already sorted, so take first)
        const bestDiscScore = discScoreCache.get(discsInSlot[0].uid) || 0;
        upperBound += bestDiscScore;
      }
    }

    return upperBound;
  }

  /**
   * Simple scoring function for disc filtering in efficient mode
   * Scores based on weighted substats only
   */
  private simpleScoreDisc(disc: Disc, algorithm: ScoringAlgorithm): number {
    let score = 0;

    // Score substats based on weights
    disc.subStats.forEach(subStat => {
      const weight = algorithm.weights[subStat.type] || 0;
      score += subStat.value * weight;
    });

    // Bonus for preferred main stat
    const preferredMainStats = algorithm.mainStatPreferences[disc.slot] || [];
    if (preferredMainStats.includes(disc.mainStat.type)) {
      score *= 1.2; // 20% bonus
    }

    return score;
  }
}
