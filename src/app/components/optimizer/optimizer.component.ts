// optimizer.component.ts - Updated version
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgentService } from '../../services/agent.service';
import { DiscService } from '../../services/disc.service';
import { WEngineService } from '../../services/wengine.service';
import { OptimizerService, OptimizedBuild, OptimizerConstraints } from '../../services/optimizer.service';
import { Agent, DiscSlot } from '../../models/agent.model';
import { WEngine } from '../../models/wengine.model';
import { SCORING_PRESETS } from '../../constants/scoring-presets';

@Component({
  selector: 'app-optimizer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './optimizer.component.html',
  styleUrls: ['./optimizer.component.css']
})
export class OptimizerComponent implements OnInit {
  agents: Agent[] = [];
  selectedAgent: Agent | null = null;
  selectedWEngine: WEngine | null = null;
  agentLevel = 60;
  mindscapeLevel = 0;
  minCritRate = 0;
  minCritDmg = 0;

  availableWEngines: WEngine[] = [];

  results: OptimizedBuild[] = [];
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

    const preset = SCORING_PRESETS[this.selectedAgent.specialty];
  }

  optimize() {
    if (!this.selectedAgent) return;

    this.isOptimizing = true;
    this.results = [];
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

    // Use setTimeout to allow UI to update
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

  selectResult(build: OptimizedBuild) {
    this.selectedResult = build;
  }

  equipBuild() {
    if (!this.selectedResult || !this.selectedAgent) return;

    // Equip all discs in the build to this agent
    Object.entries(this.selectedResult.discs).forEach(([slot, disc]) => {
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
}
