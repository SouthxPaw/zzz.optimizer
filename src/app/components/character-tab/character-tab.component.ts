import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Agent {
  id: string;
  name: string;
  rarity: number;
  element: 'Physical' | 'Fire' | 'Ice' | 'Electric' | 'Ether';
  specialty: 'Attack' | 'Stun' | 'Support' | 'Defense' | 'Anomaly';
  baseStats: {
    hp: number;
    atk: number;
    def: number;
    impact: number;
    anomalyMastery: number;
    critRate: number;
    critDmg: number;
  };
}

interface WEngine {
  id: string;
  name: string;
  rarity: number;
  baseAtk: number;
  specialty: string;
}

@Component({
  selector: 'app-character-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="character-tab">
      <div class="header">
        <h1>Zenless Zone Zero - Agent Builder</h1>
      </div>

      <div class="content-grid">
        <!-- Agent Selection -->
        <div class="section agent-selection">
          <h2>Select Agent</h2>
          <div class="agent-grid">
            <div
              *ngFor="let agent of agents"
              class="agent-card"
              [class.selected]="selectedAgent?.id === agent.id"
              (click)="selectAgent(agent)">
              <div class="agent-portrait" [attr.data-element]="agent.element">
                <span class="agent-name">{{agent.name}}</span>
              </div>
              <div class="agent-info">
                <div class="rarity">★{{agent.rarity}}</div>
                <div class="specialty">{{agent.specialty}}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Agent Details -->
        <div class="section agent-details" *ngIf="selectedAgent">
          <h2>{{selectedAgent.name}}</h2>

          <!-- Mindscape Cinema (Constellations) -->
          <div class="mindscape-section">
            <h3>Mindscape Cinema</h3>
            <div class="mindscape-toggles">
              <button
                *ngFor="let m of [1,2,3,4,5,6]"
                class="mindscape-btn"
                [class.active]="mindscapeLevel >= m"
                (click)="toggleMindscape(m)">
                M{{m}}
              </button>
            </div>
          </div>

          <!-- W-Engine Selection -->
          <div class="wengine-section">
            <h3>W-Engine</h3>
            <select [(ngModel)]="selectedWEngine" class="wengine-select">
              <option [ngValue]="null">Select W-Engine</option>
              <option *ngFor="let engine of wEngines" [ngValue]="engine">
                {{engine.name}} (★{{engine.rarity}})
              </option>
            </select>
            <div *ngIf="selectedWEngine" class="wengine-details">
              <p>Base ATK: {{selectedWEngine.baseAtk}}</p>
            </div>
          </div>

          <!-- Base Stats Display -->
          <div class="stats-section">
            <h3>Base Stats</h3>
            <div class="stats-grid">
              <div class="stat-row">
                <span class="stat-label">HP:</span>
                <span class="stat-value">{{selectedAgent.baseStats.hp}}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">ATK:</span>
                <span class="stat-value">{{selectedAgent.baseStats.atk}}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">DEF:</span>
                <span class="stat-value">{{selectedAgent.baseStats.def}}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Impact:</span>
                <span class="stat-value">{{selectedAgent.baseStats.impact}}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Anomaly Mastery:</span>
                <span class="stat-value">{{selectedAgent.baseStats.anomalyMastery}}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">CRIT Rate:</span>
                <span class="stat-value">{{selectedAgent.baseStats.critRate}}%</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">CRIT DMG:</span>
                <span class="stat-value">{{selectedAgent.baseStats.critDmg}}%</span>
              </div>
            </div>
          </div>

          <!-- Disc Drives (Relics) -->
          <div class="disc-section">
            <h3>Disc Drives</h3>
            <p class="placeholder">Disc Drive builder coming soon...</p>
          </div>
        </div>

        <!-- Summary Panel -->
        <div class="section summary-panel" *ngIf="selectedAgent">
          <h2>Build Summary</h2>
          <div class="summary-content">
            <div class="summary-item">
              <strong>Agent:</strong> {{selectedAgent.name}}
            </div>
            <div class="summary-item">
              <strong>Element:</strong> {{selectedAgent.element}}
            </div>
            <div class="summary-item">
              <strong>Specialty:</strong> {{selectedAgent.specialty}}
            </div>
            <div class="summary-item">
              <strong>Mindscape:</strong> M{{mindscapeLevel}}
            </div>
            <div class="summary-item" *ngIf="selectedWEngine">
              <strong>W-Engine:</strong> {{selectedWEngine.name}}
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .character-tab {
      padding: 20px;
      background: #1a1a2e;
      color: #eee;
      min-height: 100vh;
      font-family: Arial, sans-serif;
    }

    .header {
      text-align: center;
      margin-bottom: 30px;
    }

    .header h1 {
      color: #00d9ff;
      font-size: 2em;
      margin: 0;
    }

    .content-grid {
      display: grid;
      grid-template-columns: 2fr 3fr 2fr;
      gap: 20px;
      max-width: 1400px;
      margin: 0 auto;
    }

    .section {
      background: #16213e;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.3);
    }

    .section h2 {
      color: #00d9ff;
      margin-top: 0;
      border-bottom: 2px solid #0f3460;
      padding-bottom: 10px;
    }

    .section h3 {
      color: #88d5f5;
      margin-top: 20px;
      margin-bottom: 10px;
    }

    .agent-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 10px;
    }

    .agent-card {
      cursor: pointer;
      border-radius: 8px;
      overflow: hidden;
      transition: all 0.2s;
      border: 2px solid transparent;
    }

    .agent-card:hover {
      transform: translateY(-2px);
      border-color: #00d9ff;
    }

    .agent-card.selected {
      border-color: #ffd700;
      box-shadow: 0 0 15px rgba(255, 215, 0, 0.5);
    }

    .agent-portrait {
      height: 140px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #0f3460, #16213e);
      position: relative;
    }

    .agent-portrait[data-element="Fire"] {
      background: linear-gradient(135deg, #ff4444, #cc0000);
    }

    .agent-portrait[data-element="Ice"] {
      background: linear-gradient(135deg, #4db8ff, #0066cc);
    }

    .agent-portrait[data-element="Electric"] {
      background: linear-gradient(135deg, #ffeb3b, #ff9800);
    }

    .agent-portrait[data-element="Physical"] {
      background: linear-gradient(135deg, #bdbdbd, #757575);
    }

    .agent-portrait[data-element="Ether"] {
      background: linear-gradient(135deg, #9c27b0, #4a148c);
    }

    .agent-name {
      color: white;
      font-weight: bold;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
      font-size: 0.9em;
      text-align: center;
    }

    .agent-info {
      background: #0f3460;
      padding: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.85em;
    }

    .rarity {
      color: #ffd700;
    }

    .specialty {
      color: #88d5f5;
    }

    .mindscape-toggles {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .mindscape-btn {
      padding: 10px 16px;
      border: 2px solid #0f3460;
      background: #1a1a2e;
      color: #aaa;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
      font-weight: bold;
    }

    .mindscape-btn:hover {
      border-color: #00d9ff;
    }

    .mindscape-btn.active {
      background: #00d9ff;
      color: #1a1a2e;
      border-color: #00d9ff;
    }

    .wengine-select {
      width: 100%;
      padding: 10px;
      background: #0f3460;
      color: #eee;
      border: 2px solid #16213e;
      border-radius: 6px;
      font-size: 1em;
      cursor: pointer;
    }

    .wengine-select:focus {
      outline: none;
      border-color: #00d9ff;
    }

    .wengine-details {
      margin-top: 10px;
      padding: 10px;
      background: #0f3460;
      border-radius: 6px;
    }

    .stats-grid {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .stat-row {
      display: flex;
      justify-content: space-between;
      padding: 8px;
      background: #0f3460;
      border-radius: 4px;
    }

    .stat-label {
      color: #88d5f5;
    }

    .stat-value {
      color: #ffd700;
      font-weight: bold;
    }

    .placeholder {
      color: #666;
      font-style: italic;
      padding: 20px;
      text-align: center;
    }

    .summary-content {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .summary-item {
      padding: 10px;
      background: #0f3460;
      border-radius: 6px;
    }

    .summary-item strong {
      color: #88d5f5;
      display: block;
      margin-bottom: 4px;
    }

    @media (max-width: 1200px) {
      .content-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class CharacterTabComponent implements OnInit {
  agents: Agent[] = [
    {
      id: 'ellen',
      name: 'Ellen Joe',
      rarity: 5,
      element: 'Ice',
      specialty: 'Attack',
      baseStats: {
        hp: 8367,
        atk: 3373,
        def: 686,
        impact: 96,
        anomalyMastery: 92,
        critRate: 5,
        critDmg: 50
      }
    },
    {
      id: 'zhu-yuan',
      name: 'Zhu Yuan',
      rarity: 5,
      element: 'Ether',
      specialty: 'Attack',
      baseStats: {
        hp: 7939,
        atk: 3496,
        def: 686,
        impact: 88,
        anomalyMastery: 92,
        critRate: 5,
        critDmg: 50
      }
    },
    {
      id: 'lycaon',
      name: 'Von Lycaon',
      rarity: 5,
      element: 'Ice',
      specialty: 'Stun',
      baseStats: {
        hp: 8272,
        atk: 2992,
        def: 762,
        impact: 120,
        anomalyMastery: 92,
        critRate: 5,
        critDmg: 50
      }
    },
    {
      id: 'nicole',
      name: 'Nicole',
      rarity: 4,
      element: 'Ether',
      specialty: 'Support',
      baseStats: {
        hp: 7315,
        atk: 2729,
        def: 686,
        impact: 88,
        anomalyMastery: 115,
        critRate: 5,
        critDmg: 50
      }
    }
  ];

  wEngines: WEngine[] = [
    { id: 'deep-sea', name: 'Deep Sea Visitor', rarity: 5, baseAtk: 713, specialty: 'Attack' },
    { id: 'steel-cushion', name: 'Steel Cushion', rarity: 5, baseAtk: 713, specialty: 'Stun' },
    { id: 'street-superstar', name: 'Street Superstar', rarity: 4, baseAtk: 594, specialty: 'Attack' },
    { id: 'starlight', name: 'Starlight Engine', rarity: 4, baseAtk: 594, specialty: 'Attack' }
  ];

  selectedAgent: Agent | null = null;
  selectedWEngine: WEngine | null = null;
  mindscapeLevel = 0;

  ngOnInit() {
    // Select first agent by default
    if (this.agents.length > 0) {
      this.selectAgent(this.agents[0]);
    }
  }

  selectAgent(agent: Agent) {
    this.selectedAgent = agent;
    this.mindscapeLevel = 0;
    this.selectedWEngine = null;
  }

  toggleMindscape(level: number) {
    if (this.mindscapeLevel === level) {
      this.mindscapeLevel = level - 1;
    } else {
      this.mindscapeLevel = level;
    }
  }
}
