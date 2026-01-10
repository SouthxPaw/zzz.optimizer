import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgentService } from '../../services/agent.service';
import { DiscService } from '../../services/disc.service';
import { Agent, BaseStats } from '../../models/agent.model';
import { Disc, DiscSet, MainStatType } from '../../models/disc.model';
import { ScoringAlgorithm } from '../../models/scoring.model';
import { WEngine } from '../../models/agent.model';
import { WEngineService } from '../../services/wengine.service';
import { SCORING_PRESETS } from '../../constants/scoring-presets';
import { OptimizerConfig } from '../../models/optimizer-config.model';
import { MAIN_STAT_BY_SLOT } from '../../constants/main-stat-possibilities';

interface OptimizedBuild {
  discs: { [key in DiscSet]?: Disc };
  stats: BaseStats;
  score: number;
  setBonus: string[];
}

@Component({
  selector: 'app-optimizer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="optimizer">
      <div class="header">
        <h1>Build Optimizer</h1>
        <p class="subtitle">Find the best disc combinations for your agents</p>
      </div>

      <div class="optimizer-grid">
        <!-- Configuration Panel -->
        <div class="section config-panel">
          <h2>Configuration</h2>

          <div class="config-group">
            <label>Select Agent:</label>
            <select [(ngModel)]="selectedAgent" (change)="onAgentChange()" class="select-input">
              <option [ngValue]="null">Choose an agent...</option>
              <option *ngFor="let agent of agents" [ngValue]="agent">
                {{agent.name}} ({{agent.specialty}})
              </option>
            </select>
          </div>

          <div *ngIf="selectedAgent">
            <div class="config-group">
              <label>Agent Level:</label>
              <input
                type="number"
                [(ngModel)]="agentLevel"
                min="1"
                max="60"
                class="number-input"
              />
            </div>

            <div class="config-group">
              <label>W-Engine:</label>
              <select [(ngModel)]="selectedWEngine" class="select-input">
                <option [ngValue]="null">None</option>
                <option *ngFor="let wEngine of availableWEngines" [ngValue]="wEngine">
                  {{wEngine.name}} ({{wEngine.rarity}}-Rank)
                </option>
              </select>
              <div class="wengine-notice" *ngIf="availableWEngines.length === 0">
                <small>⚠️ No W-Engines available for {{selectedAgent.specialty}}</small>
              </div>
              <div class="wengine-info" *ngIf="selectedWEngine">
                <small class="info-text">
                  ✓ Matches {{selectedAgent.specialty}} - Effects will apply
                </small>
              </div>
            </div>

            <div class="config-group">
              <label>Mindscape Level:</label>
              <div class="mindscape-buttons">
                <button
                  *ngFor="let m of [0,1,2,3,4,5,6]"
                  [class.active]="mindscapeLevel === m"
                  (click)="mindscapeLevel = m"
                  class="mindscape-btn">
                  M{{m}}
                </button>
              </div>
            </div>

            <div class="preset-section">
              <button (click)="loadPreset()" class="btn-primary">
                Load Recommended Preset
              </button>
            </div>

            <div class="config-group">
              <label>Minimum Substats:</label>
              <div class="substat-filters">
                <div class="substat-filter">
                  <label>Min CRIT Rate:</label>
                  <input type="number" [(ngModel)]="minCritRate" class="number-input-sm" />%
                </div>
                <div class="substat-filter">
                  <label>Min CRIT DMG:</label>
                  <input type="number" [(ngModel)]="minCritDmg" class="number-input-sm" />%
                </div>
              </div>
            </div>

            <div class="optimize-section">
              <button
                (click)="optimize()"
                [disabled]="isOptimizing"
                class="btn-optimize">
                {{isOptimizing ? 'Optimizing...' : 'Start Optimization'}}
              </button>

              <div class="progress-info" *ngIf="isOptimizing">
                <div class="progress-bar">
                  <div class="progress-fill" [style.width.%]="progress"></div>
                </div>
                <span>{{progressText}}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Results Panel -->
        <div class="section results-panel">
          <div class="results-header">
            <h2>Optimization Results</h2>
            <div class="result-count" *ngIf="results.length > 0">
              {{results.length}} builds found
            </div>
          </div>

          <div class="no-results" *ngIf="!selectedAgent">
            <p>Select an agent to start optimizing</p>
          </div>

          <div class="results-list" *ngIf="results.length > 0">
            <div
              *ngFor="let build of results; let i = index"
              class="result-card"
              [class.selected]="selectedResult === build"
              (click)="selectResult(build)">

              <div class="result-header">
                <span class="rank">#{{i + 1}}</span>
                <span class="score">Score: {{build.score.toFixed(2)}}</span>
              </div>

              <div class="result-stats">
                <div class="stat-item">
                  <span>ATK:</span>
                  <span>{{build.stats.atk.toFixed(0)}}</span>
                </div>
                <div class="stat-item">
                  <span>CRIT Rate:</span>
                  <span>{{build.stats.critRate.toFixed(1)}}%</span>
                </div>
                <div class="stat-item">
                  <span>CRIT DMG:</span>
                  <span>{{build.stats.critDmg.toFixed(1)}}%</span>
                </div>
              </div>

              <div class="set-bonuses" *ngIf="build.setBonus.length > 0">
                <div *ngFor="let bonus of build.setBonus" class="set-badge">
                  {{bonus}}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Build Details Panel -->
        <div class="section details-panel" *ngIf="selectedResult">
          <h2>Build Details</h2>

          <div class="stats-display">
            <h3>Final Stats</h3>
            <div class="stats-grid">
              <div class="stat-row">
                <span>HP:</span>
                <span>{{selectedResult.stats.hp.toFixed(0)}}</span>
              </div>
              <div class="stat-row">
                <span>ATK:</span>
                <span>{{selectedResult.stats.atk.toFixed(0)}}</span>
              </div>
              <div class="stat-row">
                <span>DEF:</span>
                <span>{{selectedResult.stats.def.toFixed(0)}}</span>
              </div>
              <div class="stat-row">
                <span>CRIT Rate:</span>
                <span>{{selectedResult.stats.critRate.toFixed(1)}}%</span>
              </div>
              <div class="stat-row">
                <span>CRIT DMG:</span>
                <span>{{selectedResult.stats.critDmg.toFixed(1)}}%</span>
              </div>
            </div>
          </div>

          <div class="actions">
            <button class="btn-primary" (click)="equipBuild()">
              Equip This Build
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .optimizer {
      padding: 20px;
      background: #1a1a2e;
      color: #eee;
      min-height: 100vh;
    }

    .header {
      text-align: center;
      margin-bottom: 30px;
    }

    .header h1 {
      color: #00d9ff;
      font-size: 2.5em;
      margin: 0;
    }

    .subtitle {
      color: #88d5f5;
      margin-top: 10px;
    }

    .optimizer-grid {
      display: grid;
      grid-template-columns: 400px 1fr 400px;
      gap: 20px;
      max-width: 1800px;
      margin: 0 auto;
    }

    .section {
      background: #16213e;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.3);
      max-height: calc(100vh - 150px);
      overflow-y: auto;
    }

    .section h2 {
      color: #00d9ff;
      margin-top: 0;
      margin-bottom: 20px;
      border-bottom: 2px solid #0f3460;
      padding-bottom: 10px;
    }

    .config-group {
      margin-bottom: 20px;
    }

    .config-group label {
      display: block;
      color: #88d5f5;
      margin-bottom: 8px;
      font-weight: 500;
    }

    .select-input, .number-input, .number-input-sm {
      width: 100%;
      padding: 10px;
      background: #0f3460;
      color: #eee;
      border: 2px solid #16213e;
      border-radius: 6px;
    }

    .number-input-sm {
      width: 80px;
      padding: 5px;
    }

    .mindscape-buttons {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .mindscape-btn {
      padding: 8px 14px;
      background: #0f3460;
      color: #aaa;
      border: 2px solid #16213e;
      border-radius: 6px;
      cursor: pointer;
      font-weight: bold;
    }

    .mindscape-btn.active {
      background: #00d9ff;
      color: #1a1a2e;
    }

    .wengine-notice {
      margin-top: 8px;
      padding: 8px;
      background: #dc3545;
      border-radius: 4px;
      color: white;
      font-size: 0.85em;
    }

    .wengine-info {
      margin-top: 8px;
      padding: 8px;
      background: #28a745;
      border-radius: 4px;
    }

    .info-text {
      color: white;
      font-size: 0.85em;
    }

    .btn-optimize {
      width: 100%;
      padding: 15px;
      background: linear-gradient(135deg, #00d9ff, #0066cc);
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: bold;
      cursor: pointer;
    }

    .btn-optimize:disabled {
      opacity: 0.6;
    }

    .progress-bar {
      width: 100%;
      height: 8px;
      background: #0f3460;
      border-radius: 4px;
      margin: 10px 0;
    }

    .progress-fill {
      height: 100%;
      background: #00d9ff;
    }

    .results-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .result-card {
      background: #0f3460;
      border-radius: 8px;
      padding: 15px;
      cursor: pointer;
      border: 2px solid transparent;
    }

    .result-card:hover {
      border-color: #00d9ff;
    }

    .result-card.selected {
      border-color: #ffd700;
    }

    .result-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    .score {
      color: #ffd700;
      font-weight: bold;
    }

    .stats-grid {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .stat-row {
      display: flex;
      justify-content: space-between;
      padding: 10px;
      background: #0f3460;
      border-radius: 6px;
    }

    .btn-primary {
      width: 100%;
      padding: 12px;
      background: #00d9ff;
      color: #1a1a2e;
      border: none;
      border-radius: 6px;
      font-weight: bold;
      cursor: pointer;
    }
  `]
})
export class OptimizerComponent implements OnInit {
  agents: Agent[] = [];
  selectedAgent: Agent | null = null;
  selectedWEngine: WEngine | null = null;
  agentLevel: number = 60;
  mindscapeLevel: number = 0;
  minCritRate: number = 0;
  minCritDmg: number = 0;

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
  isOptimizing: boolean = false;
  progress: number = 0;
  progressText: string = '';

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

    // Get all W-Engines from service
    const allWEngines = this.wEngineService.getWEngines();

    // Filter to only show W-Engines matching the agent's specialty
    this.availableWEngines = allWEngines.filter(
      wEngine => wEngine.specialty === this.selectedAgent!.specialty
    );

    // Clear selected W-Engine if it doesn't match specialty
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
    // Add base ATK from W-Engine
    stats.atk += wEngine.baseAtk;

    // Apply sub-stat bonus
    const subStatType = wEngine.subStat.type;
    const subStatValue = wEngine.subStat.value;

    switch(subStatType) {
      case 'ATK%':
        stats.atk += (this.selectedAgent!.baseStats.atk * subStatValue) / 100;
        break;
      case 'CRIT_Rate':
        stats.critRate += subStatValue;
        break;
      case 'CRIT_DMG':
        stats.critDmg += subStatValue;
        break;
      case 'HP%':
        stats.hp += (this.selectedAgent!.baseStats.hp * subStatValue) / 100;
        break;
      case 'DEF%':
        stats.def += (this.selectedAgent!.baseStats.def * subStatValue) / 100;
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
