import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { Agent } from '../../models/agent.model';
import { WEngine } from '../../models/wengine.model';
import { AgentService } from '../../services/agent.service';
import { WEngineService } from '../../services/wengine.service';
import { BuildService, AgentBuild } from '../../services/build.service';

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

  private destroy$ = new Subject<void>();

  constructor(
    private buildService: BuildService,
    private agentService: AgentService,
    private wEngineService: WEngineService
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

  onWEngineChange(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const wEngineId = selectElement.value;

    if (!wEngineId) {
      // Unequip if empty value selected
      if (this.selectedBuild) {
        this.buildService.unequipWEngine(this.selectedBuild.id);
      }
      return;
    }

    const wEngine = this.referenceWEngines.find(w => w.id === wEngineId);
    if (wEngine) {
      this.equipWEngine(wEngine);
    }
  }

  getEquippedDiscsCount(build: AgentBuild): number {
    return Object.keys(build.equippedDiscs).length;
  }

  // Helper to get agent rarity display
  getRarityDisplay(agentId: string): string {
    const agent = this.referenceAgents.find(a => a.id === agentId);
    return agent?.rarity === 'S' ? '★★★★★' : '★★★★';
  }
}
