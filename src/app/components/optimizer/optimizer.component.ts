import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgentService } from '../../services/agent.service';
import { DiscService } from '../../services/disc.service';
import { Agent, BaseStats, DiscSlot } from '../../models/agent.model';
import { Disc, DiscSet, MainStatType } from '../../models/disc.model';
import { ScoringAlgorithm } from '../../models/scoring.model';
import { WEngine } from '../../models/agent.model';
import { WEngineService } from '../../services/wengine.service';
import { SCORING_PRESETS } from '../../constants/scoring-presets';
import { OptimizerConfig } from '../../models/optimizer-config.model';
import { MAIN_STAT_BY_SLOT } from '../../constants/main-stat-possibilities';

interface OptimizedBuild {
  discs: { [key in DiscSlot]?: Disc };
  stats: BaseStats;
  score: number;
  setBonus: string[];
}

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

  config: OptimizerConfig = {
    agentId: '',
    preferredMainStats: {},
    preferredSets: [],
    substatWeights: {},
    characterPriority: 1,
  };

  results: OptimizedBuild[] = [];
  selectedResult: OptimizedBuild | null = null;
  isOptimizing = false;
  progress = 0;
  progressText = '';

  constructor(
    private agentService: AgentService,
    private discService: DiscService,
    private wEngineService: WEngineService
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
    this.config.substatWeights = preset.weights;
  }

  optimize() {
    if (!this.selectedAgent) return;
    this.isOptimizing = true;
    this.results = [];

    // Simple demo optimization
    const allDiscs = this.discService.getDiscs();
    this.results = [build];

    this.isOptimizing = false;
    this.progress = 100;
  }

  private applyWEngineStats(stats: BaseStats, wEngine: WEngine) {
    stats.atk += wEngine.baseAtk;

    const subStatType = wEngine.subStat.type;
    const subStatValue = wEngine.subStat.value;

    switch(subStatType) {
      case 'ATK%':
        stats.atk += (this.selectedAgent!.lvl60Stats.atk * subStatValue) / 100;
        break;
      case 'CRIT_Rate':
        stats.critRate += subStatValue;
        break;
      case 'CRIT_DMG':
        stats.critDmg += subStatValue;
        break;
      case 'HP%':
        stats.hp += (this.selectedAgent!.lvl60Stats.hp * subStatValue) / 100;
        break;
      case 'DEF%':
        stats.def += (this.selectedAgent!.lvl60Stats.def * subStatValue) / 100;
        break;
      case 'PEN_Ratio':
        stats.penRatio += subStatValue;
        break;
      case 'Energy_Regen':
        stats.energyRegen += subStatValue / 100;
        break;
      case 'Impact':
        stats.impact += subStatValue;
        break;
      case 'Anomaly_Proficiency':
        stats.anomalyProficiency += subStatValue;
        break;
    }
  }

  selectResult(build: OptimizedBuild) {
    this.selectedResult = build;
  }

  equipBuild() {
    alert('Build equipped!');
  }
}
