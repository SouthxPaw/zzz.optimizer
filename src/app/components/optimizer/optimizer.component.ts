// optimizer.component.ts - Updated version with Web Worker
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { AgentService } from '../../services/agent.service';
import { DiscService } from '../../services/disc.service';
import { WEngineService } from '../../services/wengine.service';
import { OptimizerService, OptimizedBuild, OptimizerConstraints } from '../../services/optimizer.service';
import { Agent, DiscSlot } from '../../models/agent.model';
import { WEngine } from '../../models/wengine.model';
import { SCORING_PRESETS } from '../../constants/scoring-presets';

interface BuildViewModel {
  build: OptimizedBuild;
  rank: number;
  scoreFormatted: string;
  atkFormatted: string;
  critRateFormatted: string;
  critDmgFormatted: string;
}

@Component({
  selector: 'app-optimizer',
  standalone: true,
  imports: [CommonModule, FormsModule, ScrollingModule],
  templateUrl: './optimizer.component.html',
  styleUrls: ['./optimizer.component.css']
  // Using Default change detection due to imperative updates
})
export class OptimizerComponent implements OnInit, OnDestroy {
  agents: Agent[] = [];
  selectedAgent: Agent | null = null;
  selectedWEngine: WEngine | null = null;
  agentLevel = 60;
  mindscapeLevel = 0;
  minCritRate = 0;
  minCritDmg = 0;

  availableWEngines: WEngine[] = [];

  results: OptimizedBuild[] = [];
  resultsViewModel: BuildViewModel[] = [];
  selectedResult: OptimizedBuild | null = null;
  isOptimizing = false;
  progress = 0;
  progressText = '';

  // Advanced options
  showAdvancedOptions = false;
  minATK = 0;
  minHP = 0;
  minDEF = 0;
  preferredSets: string[] = [];
  maxResults = 100;
  useEfficientMode = true; // Use optimized algorithm by default

  private worker: Worker | null = null;

  constructor(
    private agentService: AgentService,
    private discService: DiscService,
    private wEngineService: WEngineService,
    private optimizerService: OptimizerService
  ) {}

  ngOnInit() {
    this.agents = this.agentService.getAgents();
  }

  onAgentChange() {
    if (this.selectedAgent) {
      this.loadPreset();
      this.filterWEnginesBySpecialty();
    }
  }

  filterWEnginesBySpecialty() {
    if (!this.selectedAgent) {
      this.availableWEngines = [];
      return;
    }

    const allWEngines = this.wEngineService.getWEngines();

    this.availableWEngines = allWEngines.filter(
      wEngine => wEngine.specialty === this.selectedAgent!.specialty
    );

    if (this.selectedWEngine &&
        this.selectedWEngine.specialty !== this.selectedAgent.specialty) {
      this.selectedWEngine = null;
    }
  }

  loadPreset() {
    if (!this.selectedAgent) return;
    // Preset loading functionality can be added here if needed
  }

  optimize() {
    if (!this.selectedAgent) return;

    this.isOptimizing = true;
    this.results = [];
    this.resultsViewModel = [];
    this.selectedResult = null;
    this.progress = 0;
    this.progressText = 'Starting optimization...';

    const algorithm = SCORING_PRESETS[this.selectedAgent.specialty];

    const constraints: OptimizerConstraints = {
      minCritRate: this.minCritRate > 0 ? this.minCritRate : undefined,
      minCritDmg: this.minCritDmg > 0 ? this.minCritDmg : undefined,
      minATK: this.minATK > 0 ? this.minATK : undefined,
      minHP: this.minHP > 0 ? this.minHP : undefined,
      minDEF: this.minDEF > 0 ? this.minDEF : undefined,
      preferredSets: this.preferredSets.length > 0 ? this.preferredSets : undefined,
      maxResults: this.maxResults
    };

    // Check if Web Workers are supported
    if (typeof Worker !== 'undefined') {
      this.optimizeWithWorker(algorithm, constraints);
    } else {
      // Fallback to synchronous optimization
      this.optimizeSync(algorithm, constraints);
    }
  }

  private optimizeWithWorker(algorithm: any, constraints: OptimizerConstraints) {
    // Create a new worker
    this.worker = new Worker(new URL('../../workers/optimizer.worker', import.meta.url), { type: 'module' });

    this.worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        this.progress = data.progress;
        this.progressText = data.text;
      } else if (data.type === 'complete') {
        this.results = data.builds;
        this.buildViewModel();
        this.progress = 100;
        this.progressText = `Complete! Found ${this.results.length} builds.`;

        if (this.results.length > 0) {
          this.selectResult(this.results[0]);
        }

        this.isOptimizing = false;
        this.worker?.terminate();
        this.worker = null;
      } else if (data.type === 'error') {
        console.error('Optimization error:', data.error);
        this.progressText = 'Error during optimization. Check console.';
        this.isOptimizing = false;
        this.worker?.terminate();
        this.worker = null;
      }
    };

    this.worker.onerror = (error) => {
      console.error('Worker error:', error);
      this.progressText = 'Worker error. Falling back to sync optimization.';
      this.worker?.terminate();
      this.worker = null;
      // Fallback to synchronous
      this.optimizeSync(algorithm, constraints);
    };

    // Get all unequipped discs
    const allDiscs = this.discService.getUnequippedDiscs();

    // Send data to worker
    this.worker.postMessage({
      agent: this.selectedAgent,
      level: this.agentLevel,
      wEngine: this.selectedWEngine,
      mindscapeLevel: this.mindscapeLevel,
      algorithm,
      constraints,
      allDiscs,
      useEfficientMode: this.useEfficientMode
    });
  }

  private optimizeSync(algorithm: any, constraints: OptimizerConstraints) {
    setTimeout(() => {
      try {
        const optimizeMethod = this.useEfficientMode
          ? this.optimizerService.optimizeBuildsEfficient.bind(this.optimizerService)
          : this.optimizerService.optimizeBuilds.bind(this.optimizerService);

        this.results = optimizeMethod(
          this.selectedAgent!,
          this.agentLevel,
          this.selectedWEngine,
          this.mindscapeLevel,
          algorithm,
          constraints,
          (progress, text) => {
            this.progress = progress;
            this.progressText = text;
          }
        );

        this.buildViewModel();
        this.progress = 100;
        this.progressText = `Complete! Found ${this.results.length} builds.`;

        if (this.results.length > 0) {
          this.selectResult(this.results[0]);
        }
      } catch (error) {
        console.error('Optimization error:', error);
        this.progressText = 'Error during optimization. Check console.';
      } finally {
        this.isOptimizing = false;
      }
    }, 100);
  }

  private buildViewModel() {
    this.resultsViewModel = this.results.map((build, index) => ({
      build,
      rank: index + 1,
      scoreFormatted: build.score.toFixed(2),
      atkFormatted: build.stats.atk.toFixed(0),
      critRateFormatted: build.stats.critRate.toFixed(1),
      critDmgFormatted: build.stats.critDmg.toFixed(1)
    }));
  }

  ngOnDestroy() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  selectResult(build: OptimizedBuild) {
    this.selectedResult = build;
  }

  equipBuild() {
    if (!this.selectedResult || !this.selectedAgent) return;

    // Equip all discs in the build to this agent
    Object.entries(this.selectedResult.discs).forEach(([_slot, disc]) => {
      if (disc) {
        this.discService.equipDisc(disc.uid, this.selectedAgent!.id);
      }
    });

    alert(`Build equipped to ${this.selectedAgent.name}!`);
    this.results = []; // Clear results after equipping
    this.selectedResult = null;
  }

  toggleAdvancedOptions() {
    this.showAdvancedOptions = !this.showAdvancedOptions;
  }

  // Helper to format disc slot names
  getDiscInSlot(slot: DiscSlot): string {
    const disc = this.selectedResult?.discs[slot];
    if (!disc) return 'Empty';
    return `${disc.set} (${this.formatStatType(disc.mainStat.type)})`;
  }

  // Get all disc slots
  get allSlots(): DiscSlot[] {
    return ['Drive1', 'Drive2', 'Drive3', 'Drive4', 'Drive5', 'Drive6'];
  }

  // Text formatting helper for consistent UI display
  formatStatType(statType: string): string {
    if (!statType) return '';

    // Replace underscores with spaces
    let formatted = statType.replace(/_/g, ' ');

    return formatted;
  }

  // TrackBy functions for performance optimization
  trackByAgentId(_index: number, agent: Agent): string {
    return agent.id;
  }

  trackByWEngineId(_index: number, wEngine: WEngine): string {
    return wEngine.id;
  }

  trackByBuildIndex(_index: number, item: BuildViewModel): number {
    return item.rank;
  }

  trackByDiscSlot(_index: number, slot: DiscSlot): string {
    return slot;
  }

  trackBySetName(_index: number, setName: string): string {
    return setName;
  }

  trackBySubStatIndex(index: number, _subStat: unknown): number {
    return index;
  }

  trackByBonusIndex(index: number, _bonus: string): number {
    return index;
  }

  trackByMindscapeLevel(_index: number, level: number): number {
    return level;
  }
}
