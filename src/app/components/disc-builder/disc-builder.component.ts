import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DiscService } from '../../services/disc.service'
import { AgentService } from '../../services/agent.service';
import { Disc, DiscSet } from '../../models/disc.model';
import { Agent } from '../../models/agent.model'
import { ScoringAlgorithm } from '../../models/scoring.model';
import { SCORING_PRESETS } from '../../constants/scoring-presets';

@Component({
  selector: 'app-disc-builder',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="disc-builder">
      <div class="header">
        <h1>Disc Drive Builder & Rater</h1>
      </div>

      <div class="main-content">
        <!-- Filters Section -->
        <div class="section filters-section">
          <h2>Filters & Scoring</h2>

          <div class="filter-group">
            <label>Score for Agent:</label>
            <select [(ngModel)]="selectedAgentForScoring" (change)="onScoringAgentChange()" class="select-input">
              <option [ngValue]="null">All Characters</option>
              <option *ngFor="let agent of agents" [ngValue]="agent">
                {{agent.name}} ({{agent.specialty}})
              </option>
            </select>
          </div>

          <div class="filter-group" *ngIf="selectedAgentForScoring">
            <label>Scoring Algorithm:</label>
            <div class="algorithm-info">
              <strong>{{currentAlgorithm.name}}</strong>
              <button class="btn-secondary" (click)="showWeights = !showWeights">
                {{showWeights ? 'Hide' : 'Show'}} Weights
              </button>
            </div>

            <div class="weights-display" *ngIf="showWeights">
              <div *ngFor="let stat of getWeightedStats()" class="weight-item">
                <span>{{stat.name}}:</span>
                <span class="weight-value">{{stat.weight}}</span>
              </div>
            </div>
          </div>

          <div class="filter-group">
            <label>Slot Filter:</label>
            <select [(ngModel)]="slotFilter" class="select-input">
              <option [ngValue]="null">All Slots</option>
              <option value="Drive1">Slot 1</option>
              <option value="Drive2">Slot 2</option>
              <option value="Drive3">Slot 3</option>
              <option value="Drive4">Slot 4</option>
              <option value="Drive5">Slot 5</option>
              <option value="Drive6">Slot 6</option>
            </select>
          </div>

          <div class="filter-group">
            <label>Set Filter:</label>
            <input
              type="text"
              [(ngModel)]="setFilter"
              placeholder="Search by set name..."
              class="text-input"
            />
          </div>

          <div class="filter-group">
            <label>
              <input type="checkbox" [(ngModel)]="showLockedOnly" />
              Show Locked Only
            </label>
          </div>

          <div class="filter-group">
            <label>
              <input type="checkbox" [(ngModel)]="showUnequippedOnly" />
              Show Unequipped Only
            </label>
          </div>

          <div class="stats-summary">
            <h3>Collection Stats</h3>
            <div class="stat-row">
              <span>Total Discs:</span>
              <span>{{discs.length}}</span>
            </div>
            <div class="stat-row">
              <span>Filtered:</span>
              <span>{{filteredDiscs.length}}</span>
            </div>
            <div class="stat-row">
              <span>6★ Discs:</span>
              <span>{{getSixStarCount()}}</span>
            </div>
          </div>
        </div>

        <!-- Disc List -->
        <div class="section disc-list-section">
          <div class="section-header">
            <h2>Disc Inventory ({{filteredDiscs.length}})</h2>
            <div class="sort-controls">
              <label>Sort by:</label>
              <select [(ngModel)]="sortBy" (change)="applySort()" class="select-input">
                <option value="score">Score (High to Low)</option>
                <option value="level">Level (High to Low)</option>
                <option value="rarity">Rarity (High to Low)</option>
                <option value="slot">Slot</option>
                <option value="set">Set Name</option>
                <option value="potential">Potential (High to Low)</option>
              </select>
            </div>
          </div>

          <div class="disc-grid">
            <div
              *ngFor="let disc of paginatedDiscs"
              class="disc-card"
              [class.locked]="disc.lock"
              [class.equipped]="disc.equippedBy"
              (click)="selectDisc(disc)">

              <div class="disc-header">
                <div class="disc-slot">{{formatSlot(disc.slot)}}</div>
                <div class="disc-rarity">★{{disc.rarity}}</div>
                <div class="disc-level">+{{disc.level}}</div>
              </div>

              <div class="disc-set">{{disc.set}}</div>

              <div class="disc-main-stat">
                <span class="stat-type">{{formatStatType(disc.mainStat.type)}}</span>
                <span class="stat-value">{{disc.mainStat.value}}</span>
              </div>

              <div class="disc-substats">
                <div *ngFor="let sub of disc.subStats" class="substat">
                  <span class="substat-type">{{formatStatType(sub.type)}}</span>
                  <span class="substat-value">
                    {{sub.value}}
                    <span class="roll-count" *ngIf="sub.rolls">({{sub.rolls}})</span>
                  </span>
                </div>
              </div>

              <div class="disc-footer">
                <div class="score-display" *ngIf="selectedAgentForScoring">
                  <span class="score-label">Score:</span>
                  <span class="score-value" [class.high-score]="getScore(disc) > 15">
                    {{getScore(disc)}}
                  </span>
                </div>
                <div class="equipped-by" *ngIf="disc.equippedBy">
                  <span class="equipped-label">Equipped</span>
                </div>
                <div class="lock-icon" *ngIf="disc.lock">🔒</div>
              </div>
            </div>
          </div>

          <div class="pagination" *ngIf="totalPages > 1">
            <button
              [disabled]="currentPage === 1"
              (click)="changePage(currentPage - 1)"
              class="btn-secondary">
              Previous
            </button>
            <span class="page-info">
              Page {{currentPage}} of {{totalPages}}
            </span>
            <button
              [disabled]="currentPage === totalPages"
              (click)="changePage(currentPage + 1)"
              class="btn-secondary">
              Next
            </button>
          </div>
        </div>

        <!-- Disc Details -->
        <div class="section disc-details-section" *ngIf="selectedDisc">
          <h2>Disc Details</h2>

          <div class="detail-group">
            <label>Set:</label>
            <span>{{selectedDisc.set}}</span>
          </div>

          <div class="detail-group">
            <label>Slot:</label>
            <span>{{formatSlot(selectedDisc.slot)}}</span>
          </div>

          <div class="detail-group">
            <label>Rarity:</label>
            <span>★{{selectedDisc.rarity}}</span>
          </div>

          <div class="detail-group">
            <label>Level:</label>
            <span>+{{selectedDisc.level}}</span>
          </div>

          <div class="potential-section">
            <h3>Potential Analysis</h3>
            <div class="potential-grid">
              <div class="potential-item">
                <span class="potential-label">Current:</span>
                <span class="potential-value">{{getPotential(selectedDisc).current}}</span>
              </div>
              <div class="potential-item">
                <span class="potential-label">Avg at +15:</span>
                <span class="potential-value">{{getPotential(selectedDisc).averagePotential}}</span>
              </div>
              <div class="potential-item">
                <span class="potential-label">Max at +15:</span>
                <span class="potential-value high">{{getPotential(selectedDisc).maxPotential}}</span>
              </div>
            </div>
          </div>

          <div class="recommendations-section" *ngIf="selectedAgentForScoring">
            <h3>Recommendations</h3>
            <div class="recommendation">
              <strong>Score: {{getScore(selectedDisc)}}</strong>
              <p>{{getRecommendation(selectedDisc)}}</p>
            </div>
          </div>

          <div class="actions-section">
            <button
              class="btn-primary"
              (click)="toggleLock(selectedDisc)">
              {{selectedDisc.lock ? 'Unlock' : 'Lock'}} Disc
            </button>

            <button
              class="btn-danger"
              [disabled]="selectedDisc.lock"
              (click)="deleteDisc(selectedDisc)">
              Delete Disc
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .disc-builder {
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
      font-size: 2em;
      margin: 0;
    }

    .main-content {
      display: grid;
      grid-template-columns: 300px 1fr 350px;
      gap: 20px;
      max-width: 1800px;
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
      margin-bottom: 20px;
      border-bottom: 2px solid #0f3460;
      padding-bottom: 10px;
    }

    .section h3 {
      color: #88d5f5;
      margin-top: 20px;
      margin-bottom: 10px;
    }

    .filter-group {
      margin-bottom: 15px;
    }

    .filter-group label {
      display: block;
      color: #88d5f5;
      margin-bottom: 5px;
      font-size: 0.9em;
    }

    .select-input, .text-input {
      width: 100%;
      padding: 8px;
      background: #0f3460;
      color: #eee;
      border: 2px solid #16213e;
      border-radius: 6px;
      font-size: 0.95em;
    }

    .select-input:focus, .text-input:focus {
      outline: none;
      border-color: #00d9ff;
    }

    .algorithm-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px;
      background: #0f3460;
      border-radius: 6px;
      margin-bottom: 10px;
    }

    .weights-display {
      background: #0f3460;
      padding: 10px;
      border-radius: 6px;
      max-height: 200px;
      overflow-y: auto;
    }

    .weight-item {
      display: flex;
      justify-content: space-between;
      padding: 5px 0;
      border-bottom: 1px solid #1a1a2e;
    }

    .weight-value {
      color: #ffd700;
      font-weight: bold;
    }

    .stats-summary {
      margin-top: 20px;
      padding: 15px;
      background: #0f3460;
      border-radius: 6px;
    }

    .stat-row {
      display: flex;
      justify-content: space-between;
      padding: 5px 0;
      color: #ddd;
    }

    .stat-row span:last-child {
      color: #00d9ff;
      font-weight: bold;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .sort-controls {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .sort-controls label {
      color: #88d5f5;
      font-size: 0.9em;
    }

    .sort-controls .select-input {
      width: 200px;
    }

    .disc-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 15px;
      margin-bottom: 20px;
    }

    .disc-card {
      background: #0f3460;
      border-radius: 8px;
      padding: 15px;
      cursor: pointer;
      transition: all 0.2s;
      border: 2px solid transparent;
    }

    .disc-card:hover {
      transform: translateY(-2px);
      border-color: #00d9ff;
      box-shadow: 0 4px 12px rgba(0, 217, 255, 0.3);
    }

    .disc-card.locked {
      border-color: #ffd700;
    }

    .disc-card.equipped {
      background: linear-gradient(135deg, #0f3460, #1a4d6d);
    }

    .disc-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }

    .disc-slot {
      background: #1a1a2e;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.85em;
      color: #88d5f5;
    }

    .disc-rarity {
      color: #ffd700;
      font-weight: bold;
    }

    .disc-level {
      background: #00d9ff;
      color: #1a1a2e;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: bold;
      font-size: 0.85em;
    }

    .disc-set {
      font-size: 0.95em;
      color: #ddd;
      margin-bottom: 10px;
      font-weight: 500;
    }

    .disc-main-stat {
      display: flex;
      justify-content: space-between;
      padding: 8px;
      background: #1a1a2e;
      border-radius: 6px;
      margin-bottom: 10px;
    }

    .stat-type {
      color: #88d5f5;
      font-weight: bold;
    }

    .stat-value {
      color: #ffd700;
      font-weight: bold;
    }

    .disc-substats {
      display: flex;
      flex-direction: column;
      gap: 5px;
      margin-bottom: 10px;
    }

    .substat {
      display: flex;
      justify-content: space-between;
      padding: 4px 8px;
      background: #1a1a2e;
      border-radius: 4px;
      font-size: 0.9em;
    }

    .substat-type {
      color: #aaa;
    }

    .substat-value {
      color: #eee;
    }

    .roll-count {
      color: #00d9ff;
      font-size: 0.85em;
      margin-left: 4px;
    }

    .disc-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid #1a1a2e;
    }

    .score-display {
      display: flex;
      gap: 5px;
      align-items: center;
    }

    .score-label {
      color: #888;
      font-size: 0.85em;
    }

    .score-value {
      color: #88d5f5;
      font-weight: bold;
    }

    .score-value.high-score {
      color: #ffd700;
    }

    .equipped-label {
      background: #00d9ff;
      color: #1a1a2e;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.8em;
      font-weight: bold;
    }

    .lock-icon {
      font-size: 1.2em;
    }

    .pagination {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 15px;
      padding: 20px;
    }

    .page-info {
      color: #88d5f5;
    }

    .detail-group {
      display: flex;
      justify-content: space-between;
      padding: 10px;
      background: #0f3460;
      border-radius: 6px;
      margin-bottom: 10px;
    }

    .detail-group label {
      color: #88d5f5;
      font-weight: bold;
    }

    .potential-section {
      margin-top: 20px;
      padding: 15px;
      background: #0f3460;
      border-radius: 8px;
    }

    .potential-grid {
      display: grid;
      gap: 10px;
      margin-top: 10px;
    }

    .potential-item {
      display: flex;
      justify-content: space-between;
      padding: 8px;
      background: #1a1a2e;
      border-radius: 4px;
    }

    .potential-label {
      color: #88d5f5;
    }

    .potential-value {
      color: #00d9ff;
      font-weight: bold;
    }

    .potential-value.high {
      color: #ffd700;
    }

    .recommendations-section {
      margin-top: 20px;
      padding: 15px;
      background: #0f3460;
      border-radius: 8px;
    }

    .recommendation {
      padding: 10px;
      background: #1a1a2e;
      border-radius: 6px;
      border-left: 4px solid #00d9ff;
    }

    .recommendation strong {
      color: #ffd700;
      display: block;
      margin-bottom: 5px;
    }

    .actions-section {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 20px;
    }

    .btn-primary, .btn-secondary, .btn-danger {
      padding: 10px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: bold;
      transition: all 0.2s;
    }

    .btn-primary {
      background: #00d9ff;
      color: #1a1a2e;
    }

    .btn-primary:hover {
      background: #00b8d4;
    }

    .btn-secondary {
      background: #0f3460;
      color: #eee;
      border: 2px solid #00d9ff;
    }

    .btn-secondary:hover {
      background: #16213e;
    }

    .btn-danger {
      background: #dc3545;
      color: white;
    }

    .btn-danger:hover {
      background: #c82333;
    }

    .btn-danger:disabled {
      background: #6c757d;
      cursor: not-allowed;
    }

    @media (max-width: 1400px) {
      .main-content {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class DiscBuilderComponent implements OnInit {
  discs: Disc[] = [];
  filteredDiscs: Disc[] = [];
  paginatedDiscs: Disc[] = [];
  agents: Agent[] = [];

  selectedDisc: Disc | null = null;
  selectedAgentForScoring: Agent | null = null;
  currentAlgorithm: ScoringAlgorithm = SCORING_PRESETS.Attack;

  slotFilter: DiscSet | null = null;
  setFilter: string = '';
  showLockedOnly: boolean = false;
  showUnequippedOnly: boolean = false;

  sortBy: string = 'score';
  showWeights: boolean = false;

  currentPage: number = 1;
  itemsPerPage: number = 12;
  totalPages: number = 1;

  constructor(
    private discService: DiscService,
    private agentService: AgentService
  ) {}

  ngOnInit() {
    this.agents = this.agentService.getAgents();
    this.discService.discs$.subscribe(discs => {
      this.discs = discs;
      this.applyFilters();
    });
  }

  applyFilters() {
    let filtered = [...this.discs];

    if (this.slotFilter) {
      filtered = filtered.filter(d => d.slot === this.slotFilter);
    }

    if (this.setFilter) {
      filtered = filtered.filter(d =>
        d.set.toLowerCase().includes(this.setFilter.toLowerCase())
      );
    }

    if (this.showLockedOnly) {
      filtered = filtered.filter(d => d.lock);
    }

    if (this.showUnequippedOnly) {
      filtered = filtered.filter(d => !d.equippedBy);
    }

    this.filteredDiscs = filtered;
    this.applySort();
  }

  applySort() {
    const sorted = [...this.filteredDiscs];

    switch (this.sortBy) {
      case 'score':
        sorted.sort((a, b) => this.getScore(b) - this.getScore(a));
        break;
      case 'level':
        sorted.sort((a, b) => b.level - a.level);
        break;
      case 'rarity':
        sorted.sort((a, b) => b.rarity - a.rarity);
        break;
      case 'slot':
        sorted.sort((a, b) => a.slot.localeCompare(b.slot));
        break;
      case 'set':
        sorted.sort((a, b) => a.set.localeCompare(b.set));
        break;
      case 'potential':
        sorted.sort((a, b) =>
          this.getPotential(b).maxPotential - this.getPotential(a).maxPotential
        );
        break;
    }

    this.filteredDiscs = sorted;
    this.totalPages = Math.ceil(this.filteredDiscs.length / this.itemsPerPage);
    this.updatePagination();
  }

  updatePagination() {
    const start = (this.currentPage - 1) * this.itemsPerPage;
    const end = start + this.itemsPerPage;
    this.paginatedDiscs = this.filteredDiscs.slice(start, end);
  }

  changePage(page: number) {
    this.currentPage = page;
    this.updatePagination();
  }

  onScoringAgentChange() {
    if (this.selectedAgentForScoring) {
      this.currentAlgorithm = SCORING_PRESETS[this.selectedAgentForScoring.specialty];
    }
    this.applySort();
  }

  selectDisc(disc: Disc) {
    this.selectedDisc = disc;
  }

  getScore(disc: Disc): number {
    if (!this.selectedAgentForScoring) return 0;
    return this.discService.scoreDisc(disc, this.currentAlgorithm);
  }

  getPotential(disc: Disc) {
    return this.discService.calculatePotential(disc);
  }

  getRecommendation(disc: Disc): string {
    const score = this.getScore(disc);
    const potential = this.getPotential(disc);

    if (score >= 20) {
      return 'Excellent disc! This is a keeper for this character.';
    } else if (score >= 15) {
      return 'Great disc with good substats. Consider leveling to +15.';
    } else if (score >= 10 && potential.maxPotential >= 15) {
      return 'Decent disc with upgrade potential. Monitor rolls when upgrading.';
    } else if (score < 10 && disc.level < 9) {
      return 'Mediocre disc. Consider using as fodder unless rolls improve.';
    } else {
      return 'Not ideal for this character. Better suited for others or fodder.';
    }
  }

  toggleLock(disc: Disc) {
    this.discService.updateDisc(disc.uid, { lock: !disc.lock });
  }

  deleteDisc(disc: Disc) {
    if (confirm('Are you sure you want to delete this disc?')) {
      this.discService.deleteDisc(disc.uid);
      this.selectedDisc = null;
    }
  }

  formatSlot(slot: DiscSet): string {
    return slot.replace('Drive', 'Slot ');
  }

  formatStatType(type: string): string {
    return type
      .replace(/_/g, ' ')
      .replace('DMG', 'DMG%')
      .replace('%', '%');
  }

  getWeightedStats() {
    return Object.entries(this.currentAlgorithm.weights).map(([name, weight]) => ({
      name: this.formatStatType(name),
      weight
    }));
  }

  getSRankCount(): number {
    return this.discs.filter(d => d.rarity === 'S').length;
  }
}
