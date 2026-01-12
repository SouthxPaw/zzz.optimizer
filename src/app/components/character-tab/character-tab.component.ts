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
import { DiscSetService, DiscSet } from '../../services/disc-set.service';
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
  referenceDiscSets: DiscSet[] = [];

  // UI state
  showAddAgentModal = false;
  selectedAgentForAdd: Agent | null = null;
  showDiscPicker = false;
  selectedDiscSlot: DiscSlot | null = null;

  // Disc creation state
  showDiscForm = false;
  selectedDiscSetForCreation: DiscSet | null = null;
  discFormData = {
    mainStatType: '',  // Only used for slots 4-6
    mainStatValue: 0,  // Only used for slots 4-6
    subStats: [] as Array<{ type: string; value: number }>
  };

  // Disc slots
  discSlots: DiscSlot[] = ['Drive1', 'Drive2', 'Drive3', 'Drive4', 'Drive5', 'Drive6'];

  // Disc inventory (user's created discs)
  allDiscs: Disc[] = [];

  // Disc picker filters
  discSearchTerm = '';
  discFilterSet = '';
  showOnlyUnequipped = false;

  // W-Engine picker
  showWEnginePicker = false;
  wengineSearchTerm = '';

  private destroy$ = new Subject<void>();

  constructor(
    private buildService: BuildService,
    private agentService: AgentService,
    private wEngineService: WEngineService,
    private discService: DiscService,
    private discSetService: DiscSetService,
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

    // Load reference disc sets
    this.discSetService.discSets$
      .pipe(takeUntil(this.destroy$))
      .subscribe(discSets => {
        this.referenceDiscSets = discSets;
      });

    // Load user disc inventory
    this.discService.discs$
      .pipe(takeUntil(this.destroy$))
      .subscribe(discs => {
        this.allDiscs = discs;
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

  async onWEngineSelect(wEngineId: string) {
    if (!this.selectedBuild) return;

    if (!wEngineId || wEngineId === '') {
      // Unequip if empty value selected
      console.log('Unequipping W-Engine from build:', this.selectedBuild.id);
      console.log('W-Engine before unequip:', this.selectedBuild.equippedWEngine);

      await this.buildService.unequipWEngine(this.selectedBuild.id);

      // Wait a tick for the subscription to update
      await new Promise(resolve => setTimeout(resolve, 50));

      console.log('W-Engine after unequip:', this.selectedBuild.equippedWEngine);
      console.log('Updated build stats:', this.selectedBuild.calculatedStats);

      this.showWEnginePicker = false;
      return;
    }

    const wEngine = this.referenceWEngines.find(w => w.id === wEngineId);
    if (wEngine) {
      await this.equipWEngine(wEngine);
      this.showWEnginePicker = false;
    }
  }

  async setWEngineRefinement(level: number) {
    if (!this.selectedBuild) return;

    try {
      await this.buildService.updateBuild(this.selectedBuild.id, {
        wEngineRefinement: level
      });

      // Refresh the selected build
      const updatedBuild = this.buildService.getBuildById(this.selectedBuild.id);
      if (updatedBuild) {
        this.selectedBuild = updatedBuild;
      }
    } catch (error) {
      console.error('Error setting W-Engine refinement:', error);
    }
  }

  getSpecialtyIcon(specialty: string): string {
    const specialtyMap: { [key: string]: string } = {
      'Attack': '/assets/data/images/roles/IconAttackType.webp',
      'Stun': '/assets/data/images/roles/IconStun.webp',
      'Anomaly': '/assets/data/images/roles/IconAnomaly.webp',
      'Support': '/assets/data/images/roles/IconSupport.webp',
      'Defense': '/assets/data/images/roles/IconDefense.webp',
      'Rupture': '/assets/data/images/roles/IconRupture.webp'
    };
    return specialtyMap[specialty] || '/assets/data/images/roles/IconAttackType.webp';
  }

  getFilteredWEngines(): WEngine[] {
    let filtered = this.referenceWEngines;

    // Filter by search term
    if (this.wengineSearchTerm) {
      const searchLower = this.wengineSearchTerm.toLowerCase();
      filtered = filtered.filter(w =>
        w.name.toLowerCase().includes(searchLower) ||
        w.specialty.toLowerCase().includes(searchLower)
      );
    }

    return filtered;
  }

  isWEngineSpecialtyMatch(): boolean {
    if (!this.selectedBuild || !this.selectedBuild.equippedWEngine) {
      return false;
    }

    const agent = this.referenceAgents.find(a => a.id === this.selectedBuild!.agentId);
    if (!agent) {
      return false;
    }

    return agent.specialty === this.selectedBuild!.equippedWEngine!.specialty;
  }

  getWEngineRefinementBonuses(): Array<{name: string, value: string, isPercent: boolean}> {
    if (!this.selectedBuild || !this.selectedBuild.equippedWEngine || !this.selectedBuild.equippedWEngine.effect.properties) {
      return [];
    }

    const refinementKey = `W${this.selectedBuild.wEngineRefinement}` as 'W1' | 'W2' | 'W3' | 'W4' | 'W5';

    return this.selectedBuild.equippedWEngine.effect.properties.map(prop => {
      const value = prop.values[refinementKey];
      const isPercent = prop.type !== 'Impact' && prop.type !== 'Anomaly_Proficiency';

      return {
        name: prop.name,
        value: value.toFixed(1),
        isPercent: isPercent
      };
    });
  }

  getMindscapeBonuses(): Array<{level: number, name: string, stats: Array<{name: string, value: string, isPercent: boolean}>}> {
    if (!this.selectedBuild || this.selectedBuild.mindscapeLevel === 0) {
      return [];
    }

    // Get agent reference data to access mindscape effects
    const agent = this.referenceAgents.find(a => a.id === this.selectedBuild!.agentId);
    if (!agent || !agent.mindscapeEffects) {
      return [];
    }

    // Filter mindscapes that are unlocked and have stat bonuses
    const activeMindscapes = agent.mindscapeEffects.filter(m =>
      m.level <= this.selectedBuild!.mindscapeLevel &&
      m.statBonuses &&
      m.statBonuses.length > 0 &&
      m.statBonuses.some(b => !b.conditional) // Only show mindscapes with unconditional bonuses
    );

    return activeMindscapes.map(mindscape => {
      const stats = mindscape.statBonuses!
        .filter(b => !b.conditional) // Only show unconditional bonuses
        .map(bonus => {
          const isPercent = bonus.type.endsWith('%') ||
                           ['CRIT_Rate', 'CRIT_DMG', 'PEN_Ratio', 'Energy_Regen'].includes(bonus.type);

          // Format stat name for display
          let displayName: string;
          switch(bonus.type) {
            case 'ATK%': displayName = 'ATK'; break;
            case 'HP%': displayName = 'HP'; break;
            case 'DEF%': displayName = 'DEF'; break;
            case 'CRIT_Rate': displayName = 'CRIT Rate'; break;
            case 'CRIT_DMG': displayName = 'CRIT DMG'; break;
            case 'PEN_Ratio': displayName = 'PEN Ratio'; break;
            case 'Energy_Regen': displayName = 'Energy Regen'; break;
            case 'Anomaly_Proficiency': displayName = 'Anomaly Proficiency'; break;
            case 'Anomaly_Mastery': displayName = 'Anomaly Mastery'; break;
            case 'Impact': displayName = 'Impact'; break;
            default: displayName = bonus.type; break;
          }

          return {
            name: displayName,
            value: bonus.value.toFixed(1),
            isPercent: isPercent
          };
        });

      return {
        level: mindscape.level,
        name: mindscape.name,
        stats: stats
      };
    });
  }

  getEquippedDiscsCount(build: AgentBuild): number {
    return Object.keys(build.equippedDiscs).length;
  }

  // Helper to get agent rank display
  getRankDisplay(agentId: string): string {
    const agent = this.referenceAgents.find(a => a.id === agentId);
    return agent?.rarity === 'S' ? 'S-Rank' : 'A-Rank';
  }

  // Helper to get agent icon
  getAgentIcon(agentId: string): string | undefined {
    const agent = this.referenceAgents.find(a => a.id === agentId);
    return agent?.icon;
  }

  // Helper to get agent rarity
  getAgentRarity(agentId: string): 'A' | 'S' | undefined {
    const agent = this.referenceAgents.find(a => a.id === agentId);
    return agent?.rarity;
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
  getFilteredDiscSets(): DiscSet[] {
    let filtered = this.referenceDiscSets;

    // Filter by set name
    if (this.discFilterSet) {
      filtered = filtered.filter(s => s.name === this.discFilterSet);
    }

    // Filter by search term
    if (this.discSearchTerm) {
      const searchLower = this.discSearchTerm.toLowerCase();
      filtered = filtered.filter(s => s.name.toLowerCase().includes(searchLower));
    }

    return filtered;
  }

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

  selectDiscSet(discSet: DiscSet) {
    this.selectedDiscSetForCreation = discSet;
    this.showDiscPicker = false;
    this.showDiscForm = true;

    // Reset form with defaults
    this.discFormData = {
      mainStatType: '',
      mainStatValue: 0,
      subStats: []
    };
  }

  closeDiscForm() {
    this.showDiscForm = false;
    this.selectedDiscSetForCreation = null;
    this.discFormData = {
      mainStatType: '',
      mainStatValue: 0,
      subStats: []
    };
  }

  addSubStat() {
    if (this.discFormData.subStats.length < 4) {
      this.discFormData.subStats.push({ type: 'ATK%', value: 0 });
    }
  }

  removeSubStat(index: number) {
    this.discFormData.subStats.splice(index, 1);
  }

  async createAndEquipDisc() {
    if (!this.selectedBuild || !this.selectedDiscSlot || !this.selectedDiscSetForCreation) return;

    // For slots 1-3, use fixed values. For slots 4-6, use user input
    let mainStatType: any;
    let mainStatValue: number;

    if (this.selectedDiscSlot === 'Drive1' || this.selectedDiscSlot === 'Drive2' || this.selectedDiscSlot === 'Drive3') {
      // Fixed main stats for slots 1-3
      mainStatType = this.getDefaultMainStatForSlot(this.selectedDiscSlot);
      mainStatValue = this.getMainStatValueForSlot(this.selectedDiscSlot);
    } else {
      // User input for slots 4-6
      mainStatType = this.discFormData.mainStatType;
      mainStatValue = this.discFormData.mainStatValue;
    }

    const newDisc: Disc = {
      uid: `${Date.now()}-${Math.random()}`,
      slot: this.selectedDiscSlot,
      set: this.selectedDiscSetForCreation.name,
      rarity: 'S',
      level: 15,
      mainStat: {
        type: mainStatType,
        value: mainStatValue
      },
      subStats: this.discFormData.subStats.map(s => ({
        type: s.type as any,
        value: s.value
      })),
      lock: false
    };

    try {
      // Add disc to inventory
      await this.discService.addDisc(newDisc);
      // Equip it to the build
      await this.buildService.equipDisc(this.selectedBuild.id, newDisc);
      this.closeDiscForm();
    } catch (error) {
      console.error('Error creating and equipping disc:', error);
      alert('Error creating disc');
    }
  }

  getDefaultMainStatForSlot(slot: DiscSlot): any {
    // Discs 1-3 have fixed main stats, 4-6 are flexible
    const defaults: { [key in DiscSlot]: any } = {
      'Drive1': 'HP',
      'Drive2': 'ATK',
      'Drive3': 'DEF',
      'Drive4': 'ATK%',
      'Drive5': 'Element_DMG',
      'Drive6': 'CRIT_Rate'
    };
    return defaults[slot] || 'ATK%';
  }

  getMainStatValueForSlot(slot: DiscSlot): number {
    // Fixed values for slots 1-3 at level 15
    const fixedValues: { [key in DiscSlot]?: number } = {
      'Drive1': 2200,  // HP
      'Drive2': 316,   // ATK
      'Drive3': 184    // DEF
    };
    return fixedValues[slot] || 0;
  }
}
