import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { Agent, DiscSlot } from '../../models/agent.model';
import { WEngine } from '../../models/wengine.model';
import { Disc } from '../../models/disc.model';
import { AgentService } from '../../services/agent.service';
import { WEngineService } from '../../services/wengine.service';
import { DiscService } from '../../services/disc.service';
import { BuildService, AgentBuild } from '../../services/build.service';
import { StatCalculatorService } from '../../services/stat-calculator.service';

@Component({
  selector: 'app-character-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './character-tab.component.html',
  styleUrls: ['./character-tab.component.css']
})
export class CharacterTabComponent implements OnInit, OnDestroy {
  // User builds (not reference data!)
  builds: AgentBuild[] = [];
  selectedBuild: AgentBuild | null = null;

  // Reference data for adding new builds
  referenceAgents: Agent[] = [];
  referenceWEngines: WEngine[] = [];

  // UI state
  showAddAgentModal = false;
  selectedAgentForAdd: Agent | null = null;
  showDiscPicker = false;
  selectedDiscSlot: DiscSlot | null = null;

  // Disc slots
  discSlots: DiscSlot[] = ['Drive1', 'Drive2', 'Drive3', 'Drive4', 'Drive5', 'Drive6'];

  // Disc inventory
  allDiscs: Disc[] = [];

  // Disc picker filters
  discSearchTerm = '';
  discFilterSet = '';
  showOnlyUnequipped = false;
  availableDiscSets: string[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private buildService: BuildService,
    private agentService: AgentService,
    private wEngineService: WEngineService,
    private discService: DiscService,
    private statCalculator: StatCalculatorService
  ) {}

  ngOnInit() {
    // Subscribe to user builds
    this.buildService.builds$
      .pipe(takeUntil(this.destroy$))
      .subscribe(builds => {
        this.builds = builds;
        // Auto-select first build if none selected
        if (builds.length > 0 && !this.selectedBuild) {
          this.selectBuild(builds[0]);
        }
      });

    // Subscribe to selected build
    this.buildService.selectedBuild$
      .pipe(takeUntil(this.destroy$))
      .subscribe(build => {
        this.selectedBuild = build;
      });

    // Load reference agents for the "Add Agent" modal
    this.agentService.agents$
      .pipe(takeUntil(this.destroy$))
      .subscribe(agents => {
        this.referenceAgents = agents;
      });

    // Load reference W-Engines
    this.wEngineService.wEngines$
      .pipe(takeUntil(this.destroy$))
      .subscribe(wEngines => {
        this.referenceWEngines = wEngines;
      });

    // Load user disc inventory
    this.discService.discs$
      .pipe(takeUntil(this.destroy$))
      .subscribe(discs => {
        this.allDiscs = discs;
        // Extract unique disc sets for filtering
        this.availableDiscSets = [...new Set(discs.map(d => d.set))].sort();
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  selectBuild(build: AgentBuild) {
    this.buildService.selectBuild(build);
  }

  openAddAgentModal() {
    this.showAddAgentModal = true;
    this.selectedAgentForAdd = null;
  }

  closeAddAgentModal() {
    this.showAddAgentModal = false;
    this.selectedAgentForAdd = null;
  }

  selectAgentForAdd(agent: Agent) {
    this.selectedAgentForAdd = agent;
  }

  async addAgentBuild() {
    if (!this.selectedAgentForAdd) {
      alert('Please select an agent');
      return;
    }

    // Check if this agent already has a build
    const existingBuild = this.builds.find(b => b.agentId === this.selectedAgentForAdd!.id);
    if (existingBuild) {
      alert(`You already have a build for ${this.selectedAgentForAdd.name}. Each agent can only have one build.`);
      return;
    }

    try {
      const newBuild = await this.buildService.createBuild(this.selectedAgentForAdd, 0);
      this.closeAddAgentModal();
      this.selectBuild(newBuild);
    } catch (error) {
      console.error('Error creating build:', error);
      alert('Error creating build');
    }
  }

  async deleteBuild(buildId: string, event: Event) {
    event.stopPropagation();

    if (confirm('Are you sure you want to delete this build?')) {
      try {
        await this.buildService.deleteBuild(buildId);
      } catch (error) {
        console.error('Error deleting build:', error);
        alert('Error deleting build');
      }
    }
  }

  toggleMindscape(level: number) {
    if (!this.selectedBuild) return;

    const newLevel = this.selectedBuild.mindscapeLevel === level ? level - 1 : level;
    this.buildService.updateBuild(this.selectedBuild.id, {
      mindscapeLevel: newLevel
    });
  }

  async equipWEngine(wEngine: WEngine | undefined) {
    if (!this.selectedBuild || !wEngine) return;

    try {
      await this.buildService.equipWEngine(this.selectedBuild.id, wEngine);
    } catch (error) {
      console.error('Error equipping W-Engine:', error);
    }
  }

  async onWEngineChange(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const wEngineId = selectElement.value;

    if (!wEngineId) {
      // Unequip if empty value selected
      if (this.selectedBuild) {
        await this.buildService.unequipWEngine(this.selectedBuild.id);
      }
      return;
    }

    const wEngine = this.referenceWEngines.find(w => w.id === wEngineId);
    if (wEngine) {
      await this.equipWEngine(wEngine);
    }
  }

  getEquippedDiscsCount(build: AgentBuild): number {
    return Object.keys(build.equippedDiscs).length;
  }

  // Helper to get agent rank display
  getRankDisplay(agentId: string): string {
    const agent = this.referenceAgents.find(a => a.id === agentId);
    return agent?.rarity === 'S' ? 'S-Rank' : 'A-Rank';
  }

  // Disc management methods
  openDiscPicker(slot: DiscSlot) {
    if (!this.selectedBuild) return;
    this.selectedDiscSlot = slot;
    this.showDiscPicker = true;
  }

  closeDiscPicker() {
    this.showDiscPicker = false;
    this.selectedDiscSlot = null;
  }

  async unequipDisc(slot: DiscSlot, event: Event) {
    event.stopPropagation();
    if (!this.selectedBuild) return;

    try {
      await this.buildService.unequipDisc(this.selectedBuild.id, slot);
    } catch (error) {
      console.error('Error unequipping disc:', error);
    }
  }

  getSetBonuses(): string[] {
    if (!this.selectedBuild) return [];
    return this.statCalculator.getSetBonuses(this.selectedBuild.equippedDiscs);
  }

  // Disc picker methods
  getFilteredDiscs(): Disc[] {
    let filtered = this.allDiscs;

    // Filter by selected slot (only show discs that match the slot being filled)
    if (this.selectedDiscSlot) {
      filtered = filtered.filter(d => d.slot === this.selectedDiscSlot);
    }

    // Filter by set
    if (this.discFilterSet) {
      filtered = filtered.filter(d => d.set === this.discFilterSet);
    }

    // Filter by search term
    if (this.discSearchTerm) {
      const searchLower = this.discSearchTerm.toLowerCase();
      filtered = filtered.filter(d => d.set.toLowerCase().includes(searchLower));
    }

    // Filter unequipped only
    if (this.showOnlyUnequipped) {
      filtered = filtered.filter(d => !d.equippedBy);
    }

    return filtered;
  }

  async equipDiscToBuild(disc: Disc) {
    if (!this.selectedBuild || !this.selectedDiscSlot) return;

    try {
      await this.buildService.equipDisc(this.selectedBuild.id, disc);
      this.closeDiscPicker();
    } catch (error) {
      console.error('Error equipping disc:', error);
      alert('Error equipping disc');
    }
  }
}
