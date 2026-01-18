/// <reference lib="webworker" />

import { Agent, BaseStats, DiscSlot } from '../models/agent.model';
import { Disc } from '../models/disc.model';
import { WEngine } from '../models/wengine.model';
import { ScoringAlgorithm } from '../models/scoring.model';
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

interface WorkerInput {
  agent: Agent;
  level: number;
  wEngine: WEngine | null;
  mindscapeLevel: number;
  algorithm: ScoringAlgorithm;
  constraints: OptimizerConstraints;
  allDiscs: Disc[];
  useEfficientMode: boolean;
}

addEventListener('message', ({ data }: MessageEvent<WorkerInput>) => {
  const { agent, level, wEngine, mindscapeLevel, algorithm, constraints, allDiscs, useEfficientMode } = data;

  try {
    const builds = useEfficientMode
      ? optimizeBuildsEfficient(agent, level, wEngine, mindscapeLevel, algorithm, constraints, allDiscs)
      : optimizeBuilds(agent, level, wEngine, mindscapeLevel, algorithm, constraints, allDiscs);

    postMessage({ type: 'complete', builds });
  } catch (error) {
    postMessage({ type: 'error', error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

function optimizeBuilds(
  agent: Agent,
  level: number,
  wEngine: WEngine | null,
  mindscapeLevel: number,
  algorithm: ScoringAlgorithm,
  constraints: OptimizerConstraints,
  allDiscs: Disc[]
): OptimizedBuild[] {
  // Group discs by slot
  const discsBySlot: { [key in DiscSlot]: Disc[] } = {
    Drive1: filterDiscsBySlot(allDiscs, 'Drive1'),
    Drive2: filterDiscsBySlot(allDiscs, 'Drive2'),
    Drive3: filterDiscsBySlot(allDiscs, 'Drive3'),
    Drive4: filterDiscsBySlot(allDiscs, 'Drive4'),
    Drive5: filterDiscsBySlot(allDiscs, 'Drive5'),
    Drive6: filterDiscsBySlot(allDiscs, 'Drive6'),
  };

  // Filter based on preferred main stats
  const slots: DiscSlot[] = ['Drive1', 'Drive2', 'Drive3', 'Drive4', 'Drive5', 'Drive6'];
  slots.forEach(slot => {
    const preferredMainStats = algorithm.mainStatPreferences[slot];
    if (preferredMainStats && preferredMainStats.length > 0) {
      discsBySlot[slot] = discsBySlot[slot].filter(disc =>
        preferredMainStats.includes(disc.mainStat.type)
      );
    }
  });

  const totalCombinations = calculateTotalCombinations(discsBySlot);
  postMessage({ type: 'progress', progress: 0, text: `Starting optimization (${totalCombinations.toLocaleString()} combinations)...` });

  const builds: OptimizedBuild[] = [];
  let evaluated = 0;
  let lastProgressUpdate = 0;

  generateCombinations(
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

      // Update progress every 5000 builds instead of 1000
      if (evaluated - lastProgressUpdate >= 5000) {
        const progress = (evaluated / totalCombinations) * 100;
        postMessage({ type: 'progress', progress, text: `Evaluated ${evaluated.toLocaleString()} builds...` });
        lastProgressUpdate = evaluated;
      }
    }
  );

  // Sort by score
  builds.sort((a, b) => b.score - a.score);

  const maxResults = constraints.maxResults || 100;
  return builds.slice(0, maxResults);
}

function optimizeBuildsEfficient(
  agent: Agent,
  level: number,
  wEngine: WEngine | null,
  mindscapeLevel: number,
  algorithm: ScoringAlgorithm,
  constraints: OptimizerConstraints,
  allDiscs: Disc[]
): OptimizedBuild[] {
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
    let slotDiscs = filterDiscsBySlot(allDiscs, slot);

    const preferredMainStats = algorithm.mainStatPreferences[slot];
    if (preferredMainStats && preferredMainStats.length > 0) {
      slotDiscs = slotDiscs.filter(disc =>
        preferredMainStats.includes(disc.mainStat.type)
      );
    }

    // Score and keep top 20 per slot
    slotDiscs = slotDiscs
      .map(disc => ({
        disc,
        score: scoreDisc(disc, algorithm)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(item => item.disc);

    discsBySlot[slot] = slotDiscs;
  });

  return optimizeBuilds(agent, level, wEngine, mindscapeLevel, algorithm, constraints,
    Object.values(discsBySlot).flat());
}

function filterDiscsBySlot(discs: Disc[], slot: DiscSlot): Disc[] {
  return discs.filter(d => d.slot === slot);
}

function calculateTotalCombinations(discsBySlot: { [key in DiscSlot]: Disc[] }): number {
  return Object.values(discsBySlot).reduce((total, discs) => {
    return total * Math.max(discs.length, 1);
  }, 1);
}

function generateCombinations(
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
  const currentDiscs: { [key in DiscSlot]?: Disc } = {};
  const indices: number[] = new Array(slots.length).fill(0);
  let slotIndex = 0;

  while (slotIndex >= 0) {
    const currentSlot = slots[slotIndex];
    const availableDiscs = discsBySlot[currentSlot];

    if (indices[slotIndex] < availableDiscs.length) {
      currentDiscs[currentSlot] = availableDiscs[indices[slotIndex]];

      if (slotIndex === slots.length - 1) {
        const build = evaluateBuild(currentDiscs, agent, level, wEngine, mindscapeLevel, algorithm);

        if (meetsConstraints(build, constraints)) {
          onBuild(build);
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
}

function evaluateBuild(
  discs: { [key in DiscSlot]?: Disc },
  agent: Agent,
  level: number,
  wEngine: WEngine | null,
  mindscapeLevel: number,
  algorithm: ScoringAlgorithm
): OptimizedBuild {
  const stats = calculateFinalStats(agent, level, wEngine, discs, mindscapeLevel);
  const score = calculateWeightedBuildScore(stats, discs, algorithm, getSetBonuses);
  const setBonus = getSetBonuses(discs);

  return { discs, stats, score, setBonus };
}

function calculateFinalStats(
  agent: Agent,
  level: number,
  wEngine: WEngine | null,
  discs: { [key in DiscSlot]?: Disc },
  mindscapeLevel: number = 0
): BaseStats {
  // Initialize percent bonuses to 0 since they may not exist in older data
  const stats: BaseStats = {
    ...agent.lvl60Stats,
    anomalyMasteryPercent: 0,
    energyRegenPercent: 0
  };

  // Apply W-Engine stats
  if (wEngine) {
    stats.atk += wEngine.baseAtk;

    const subStatType = wEngine.subStat.type;
    const subStatValue = wEngine.subStat.value;

    switch(subStatType) {
      case 'ATK%': stats.atkpercent += subStatValue; break;
      case 'CRIT_Rate': stats.critRate += subStatValue; break;
      case 'CRIT_DMG': stats.critDmg += subStatValue; break;
      case 'HP%': stats.hppercent += subStatValue; break;
      case 'DEF%': stats.defpercent += subStatValue; break;
      case 'PEN_Ratio': stats.penRatio += subStatValue; break;
      case 'Energy_Regen': stats.energyRegenPercent += subStatValue; break;
      case 'Impact': stats.impact += subStatValue; break;
      case 'Anomaly_Proficiency': stats.anomalyProficiency += subStatValue; break;
    }
  }

  // Apply mindscape stats
  if (agent.mindscapeEffects && mindscapeLevel > 0) {
    agent.mindscapeEffects.forEach(mindscape => {
      if (mindscape.level <= mindscapeLevel && mindscape.statBonuses) {
        mindscape.statBonuses.forEach(bonus => {
          if (!bonus.conditional) {
            const value = bonus.value;
            const type = bonus.type;

            switch(type) {
              case 'ATK%': stats.atkpercent += value; break;
              case 'HP%': stats.hppercent += value; break;
              case 'DEF%': stats.defpercent += value; break;
              case 'CRIT_Rate': stats.critRate += value; break;
              case 'CRIT_DMG': stats.critDmg += value; break;
              case 'PEN_Ratio': stats.penRatio += value; break;
              case 'Energy_Regen': stats.energyRegenPercent += value; break;
              case 'Anomaly_Proficiency': stats.anomalyProficiency += value; break;
              case 'Anomaly_Mastery': stats.anomalyMastery += value; break;
              case 'Impact': stats.impact += value; break;
            }
          }
        });
      }
    });
  }

  // Apply disc main stats
  Object.values(discs).forEach(disc => {
    if (!disc) return;
    const mainStat = disc.mainStat;

    switch(mainStat.type) {
      case 'HP': stats.hp += mainStat.value; break;
      case 'HP%': stats.hppercent += mainStat.value; break;
      case 'ATK': stats.atk += mainStat.value; break;
      case 'ATK%': stats.atkpercent += mainStat.value; break;
      case 'DEF': stats.def += mainStat.value; break;
      case 'DEF%': stats.defpercent += mainStat.value; break;
      case 'CRIT_Rate': stats.critRate += mainStat.value; break;
      case 'CRIT_DMG': stats.critDmg += mainStat.value; break;
      case 'Anomaly_Proficiency': stats.anomalyProficiency += mainStat.value; break;
      case 'Anomaly_Mastery': stats.anomalyMasteryPercent += mainStat.value; break;
      case 'Pen_Ratio': stats.penRatio += mainStat.value; break;
      case 'Impact': stats.impact += mainStat.value; break;
      case 'Energy_Regen': stats.energyRegenPercent += mainStat.value; break;
    }
  });

  // Apply disc substats
  Object.values(discs).forEach(disc => {
    if (!disc) return;

    disc.subStats.forEach(subStat => {
      switch(subStat.type) {
        case 'HP': stats.hp += subStat.value; break;
        case 'HP%': stats.hppercent += subStat.value; break;
        case 'ATK': stats.atk += subStat.value; break;
        case 'ATK%': stats.atkpercent += subStat.value; break;
        case 'DEF': stats.def += subStat.value; break;
        case 'DEF%': stats.defpercent += subStat.value; break;
        case 'CRIT_Rate': stats.critRate += subStat.value; break;
        case 'CRIT_DMG': stats.critDmg += subStat.value; break;
        case 'Anomaly_Proficiency': stats.anomalyProficiency += subStat.value; break;
        case 'PEN': stats.pen += subStat.value; break;
        case 'Impact': stats.impact += subStat.value; break;
        case 'Energy_Regen': stats.energyRegenPercent += subStat.value; break;
      }
    });
  });

  // Apply set bonuses
  applySetBonuses(stats, discs, agent, wEngine);

  // Calculate final energy regen using correct formula:
  // Energy/sec = Base × (1 + Σ %bonuses/100)
  const finalEnergyRegen = stats.energyRegen * (1 + stats.energyRegenPercent / 100);

  return {
    hp: Math.round(stats.hp),
    hppercent: Math.round(stats.hppercent * 10) / 10,
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
}

function applySetBonuses(
  stats: BaseStats,
  discs: { [key in DiscSlot]?: Disc },
  agent: Agent,
  wEngine: WEngine | null
): void {
  const setCounts = new Map<string, number>();
  Object.values(discs).forEach(disc => {
    if (!disc) return;
    const count = setCounts.get(disc.set) || 0;
    setCounts.set(disc.set, count + 1);
  });

  // Simple set bonus application (2pc bonuses mostly)
  // Note: This is simplified. Full implementation would need disc set data
  setCounts.forEach((count, setName) => {
    if (count >= 2) {
      // Apply basic 2pc bonuses - simplified for worker
      // In production, you'd load the DISC_SETS constant here
    }
    if (count >= 4) {
      // 15% bonus for 4-piece sets
      // This is a simplification
    }
  });

  const baseHP = agent.lvl60Stats.hp;
  const baseATK = agent.lvl60Stats.atk;
  const baseDEF = agent.lvl60Stats.def;
  const baseAnomalyMastery = agent.lvl60Stats.anomalyMastery;
  const wEngineBaseATK = wEngine?.baseAtk || 0;

  const flatHPFromDiscs = stats.hp - baseHP;
  const flatATKFromDiscs = stats.atk - baseATK - wEngineBaseATK;
  const flatDEFFromDiscs = stats.def - baseDEF;

  // For Anomaly Mastery, flat bonuses come from mindscape effects only
  const flatAnomalyMasteryBonuses = stats.anomalyMastery - baseAnomalyMastery;

  stats.hp = baseHP * (1 + stats.hppercent / 100) + flatHPFromDiscs;
  stats.atk = (baseATK + wEngineBaseATK) * (1 + stats.atkpercent / 100) + flatATKFromDiscs;
  stats.def = baseDEF * (1 + stats.defpercent / 100) + flatDEFFromDiscs;

  // Apply Anomaly Mastery percentage formula:
  // Final = Base × (1 + Anomaly Mastery%) + Flat Bonuses
  stats.anomalyMastery = baseAnomalyMastery * (1 + stats.anomalyMasteryPercent / 100) + flatAnomalyMasteryBonuses;
}

function meetsConstraints(build: OptimizedBuild, constraints: OptimizerConstraints): boolean {
  if (constraints.minCritRate && build.stats.critRate < constraints.minCritRate) return false;
  if (constraints.minCritDmg && build.stats.critDmg < constraints.minCritDmg) return false;
  if (constraints.minATK && build.stats.atk < constraints.minATK) return false;
  if (constraints.minHP && build.stats.hp < constraints.minHP) return false;
  if (constraints.minDEF && build.stats.def < constraints.minDEF) return false;
  if (constraints.preferredSets && constraints.preferredSets.length > 0) {
    const hasPreferredSet = build.setBonus.some(bonus =>
      constraints.preferredSets!.some(preferred => bonus.includes(preferred))
    );
    if (!hasPreferredSet) return false;
  }
  return true;
}

function getSetBonuses(discs: { [key in DiscSlot]?: Disc }): string[] {
  const setCounts = new Map<string, number>();
  Object.values(discs).forEach(disc => {
    if (!disc) return;
    const count = setCounts.get(disc.set) || 0;
    setCounts.set(disc.set, count + 1);
  });

  const activeBonuses: string[] = [];
  setCounts.forEach((count, setName) => {
    if (count >= 2) {
      activeBonuses.push(`${setName} (2pc)`);
    }
    if (count >= 4) {
      activeBonuses.push(`${setName} (4pc)`);
    }
  });

  return activeBonuses;
}

function scoreDisc(disc: Disc, algorithm: ScoringAlgorithm): number {
  let score = 0;

  disc.subStats.forEach(subStat => {
    const weight = algorithm.weights[subStat.type] || 0;
    const normalizedValue = normalizeSubstatValue(subStat);
    score += normalizedValue * weight;
  });

  const preferredMainStats = algorithm.mainStatPreferences[disc.slot] || [];
  if (preferredMainStats.includes(disc.mainStat.type)) {
    score *= 1.2;
  }

  return Math.round(score * 100) / 100;
}

function normalizeSubstatValue(subStat: { type: string; value: number }): number {
  const maxRolls: Record<string, number> = {
    HP: 672,
    'HP%': 18.0,
    ATK: 114,
    'ATK%': 18.0,
    DEF: 96,
    'DEF%': 28.8,
    CRIT_Rate: 14.4,
    CRIT_DMG: 28.8,
    Anomaly_Proficiency: 54,
    Anomaly_Mastery: 54,
    PEN: 54,
    Impact: 54,
    Energy_Regen: 28.8,
  };

  const maxRoll = maxRolls[subStat.type] || 1;
  return subStat.value / maxRoll;
}
