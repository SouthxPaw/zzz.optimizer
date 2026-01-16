import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { Agent, DiscSlot } from '../../models/agent.model';
import { WEngine } from '../../models/wengine.model';
import { Disc, MainStatType, SubStatType } from '../../models/disc.model';
import { AgentService } from '../../services/agent.service';
import { WEngineService } from '../../services/wengine.service';
import { DiscService } from '../../services/disc.service';
import { DiscSetService, DiscSet } from '../../services/disc-set.service';
import { BuildService, AgentBuild } from '../../services/build.service';
import { StatCalculatorService } from '../../services/stat-calculator.service';
import { ScoringService } from '../../services/scoring.service';
import { ImagePreloaderService } from '../../services/image-preloader.service';
import { DataMappingService } from '../../services/data-mapping.service';
import { DiscRating, BuildRating } from '../../constants/disc-scoring';
import { OptimizerComponent } from '../optimizer/optimizer.component';

@Component({
  selector: 'app-character-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, OptimizerComponent],
  templateUrl: './character-tab.component.html',
  styleUrls: ['./character-tab.component.css']
  // Using Default change detection due to many imperative updates
})
export class CharacterTabComponent implements OnInit, OnDestroy {
  // User builds (not reference data!)
  builds: AgentBuild[] = [];
  selectedBuild: AgentBuild | null = null;

  // Active tab
  activeTab: 'builds' | 'optimizer' = 'builds';

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
  editingDiscUid: string | null = null;  // Track which disc is being edited
  isEditMode: boolean = false;  // Track if we're editing vs creating
  discFormData = {
    mainStatType: '',  // Only used for slots 4-6
    mainStatValue: '' as string | number,  // Can be string for input, number for processing
    subStats: [] as Array<{ type: string; value: string | number }>
  };

  // Disc slots
  discSlots: DiscSlot[] = ['Drive1', 'Drive2', 'Drive3', 'Drive4', 'Drive5', 'Drive6'];

  // Disc inventory (user's created discs)
  allDiscs: Disc[] = [];

  // Disc picker filters
  discSearchTerm = '';
  discEffectSearchTerm = '';
  discFilterSet = '';
  showOnlyUnequipped = false;

  // Search subjects for debouncing
  private discSearchSubject$ = new Subject<string>();
  private discEffectSearchSubject$ = new Subject<string>();

  // Actual debounced search values
  private debouncedDiscSearch = '';
  private debouncedDiscEffectSearch = '';

  // Cached filtered results to avoid re-filtering on every change detection
  cachedFilteredDiscSets: DiscSet[] = [];
  cachedFilteredDiscs: Disc[] = [];

  // W-Engine picker
  showWEnginePicker = false;
  wengineSearchTerm = '';
  wengineSpecialtyFilter = '';
  wengineRarityFilter = '';
  wengineSortBy = 'name';

  // Agent picker filters
  agentElementFilter = '';
  agentSpecialtyFilter = '';
  agentRarityFilter = '';
  agentSortBy = 'name';

  // Assumptions notice
  showAssumptionsNotice = true;

  // Confirmation dialog
  showConfirmDialog = false;
  confirmDialogData = {
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    onConfirm: () => {}
  };

  private destroy$ = new Subject<void>();
  private previouslyFocusedElement: HTMLElement | null = null;

  // Click guard flags to prevent double-clicking
  private isProcessingDiscAction = false;
  private isProcessingWEngineAction = false;
  private isProcessingAgentAction = false;

  constructor(
    private buildService: BuildService,
    private agentService: AgentService,
    private wEngineService: WEngineService,
    private discService: DiscService,
    private discSetService: DiscSetService,
    private statCalculator: StatCalculatorService,
    private scoringService: ScoringService,
    private imagePreloader: ImagePreloaderService,
    private dataMappingService: DataMappingService
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
        // Preload agent images
        this.preloadAgentImages(agents);
      });

    // Load reference W-Engines
    this.wEngineService.wEngines$
      .pipe(takeUntil(this.destroy$))
      .subscribe(wEngines => {
        this.referenceWEngines = wEngines;
        // Preload W-Engine images
        this.preloadWEngineImages(wEngines);
      });

    // Load reference disc sets
    this.discSetService.discSets$
      .pipe(takeUntil(this.destroy$))
      .subscribe(discSets => {
        this.referenceDiscSets = discSets;
        // Initialize cached filtered disc sets
        this.updateFilteredDiscSets();
        // Preload disc set images
        this.preloadDiscSetImages(discSets);
      });

    // Load user disc inventory
    this.discService.discs$
      .pipe(takeUntil(this.destroy$))
      .subscribe(discs => {
        this.allDiscs = discs;
        // Update cached filtered discs whenever inventory changes
        this.updateFilteredDiscs();
      });

    // Set up debounced search for disc set name
    this.discSearchSubject$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(searchTerm => {
        this.debouncedDiscSearch = searchTerm;
        this.updateFilteredDiscSets();
      });

    // Set up debounced search for disc effects
    this.discEffectSearchSubject$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(searchTerm => {
        this.debouncedDiscEffectSearch = searchTerm;
        this.updateFilteredDiscSets();
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
    this.previouslyFocusedElement = document.activeElement as HTMLElement;
    this.showAddAgentModal = true;
    this.selectedAgentForAdd = null;
    // Focus first interactive element after modal renders
    setTimeout(() => {
      const firstFocusable = document.querySelector('.modal-content button, .modal-content input, .modal-content select') as HTMLElement;
      firstFocusable?.focus();
    }, 100);
  }

  closeAddAgentModal() {
    this.showAddAgentModal = false;
    this.selectedAgentForAdd = null;
    // Restore focus to previously focused element
    this.previouslyFocusedElement?.focus();
    this.previouslyFocusedElement = null;
  }

  dismissAssumptionsNotice() {
    this.showAssumptionsNotice = false;
  }

  selectAgentForAdd(agent: Agent) {
    this.selectedAgentForAdd = agent;
  }

  async addAgentBuild() {
    if (!this.selectedAgentForAdd || this.isProcessingAgentAction) {
      return;
    }

    // Check if this agent already has a build
    const existingBuild = this.builds.find(b => b.agentId === this.selectedAgentForAdd!.id);
    if (existingBuild) {
      alert(`You already have a build for ${this.selectedAgentForAdd.name}. Each agent can only have one build.`);
      return;
    }

    this.isProcessingAgentAction = true;

    try {
      const newBuild = await this.buildService.createBuild(this.selectedAgentForAdd, 0);
      this.closeAddAgentModal();
      this.selectBuild(newBuild);
    } catch (error) {
      console.error('Error creating build:', error);
      alert('Error creating build');
    } finally {
      this.isProcessingAgentAction = false;
    }
  }

  async deleteBuild(buildId: string, event: Event) {
    event.stopPropagation();

    this.showConfirmation(
      'Delete Build',
      'Are you sure you want to delete this build? This action cannot be undone.',
      async () => {
        try {
          await this.buildService.deleteBuild(buildId);
        } catch (error) {
          console.error('Error deleting build:', error);
          alert('Error deleting build');
        }
      },
      'Delete',
      'Cancel'
    );
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
    if (!this.selectedBuild || this.isProcessingWEngineAction) return;

    this.isProcessingWEngineAction = true;

    try {
      if (!wEngineId || wEngineId === '') {
        // Unequip if empty value selected
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
    } finally {
      this.isProcessingWEngineAction = false;
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
      'Attack': 'assets/data/images/roles/IconAttackType.webp',
      'Stun': 'assets/data/images/roles/IconStun.webp',
      'Anomaly': 'assets/data/images/roles/IconAnomaly.webp',
      'Support': 'assets/data/images/roles/IconSupport.webp',
      'Defense': 'assets/data/images/roles/IconDefense.webp',
      'Rupture': 'assets/data/images/roles/IconRupture.webp'
    };
    return specialtyMap[specialty] || 'assets/data/images/roles/IconAttackType.webp';
  }

  getFilteredAgents(): Agent[] {
    let filtered = this.referenceAgents;

    // Filter by element
    if (this.agentElementFilter) {
      filtered = filtered.filter(a => a.element === this.agentElementFilter);
    }

    // Filter by specialty
    if (this.agentSpecialtyFilter) {
      filtered = filtered.filter(a => a.specialty === this.agentSpecialtyFilter);
    }

    // Filter by rarity
    if (this.agentRarityFilter) {
      filtered = filtered.filter(a => a.rarity === this.agentRarityFilter);
    }

    // Sort
    return this.sortAgents(filtered);
  }

  sortAgents(agents: Agent[]): Agent[] {
    const sorted = [...agents];

    switch (this.agentSortBy) {
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'element':
        sorted.sort((a, b) => a.element.localeCompare(b.element));
        break;
      case 'specialty':
        sorted.sort((a, b) => a.specialty.localeCompare(b.specialty));
        break;
      case 'rarity':
        sorted.sort((a, b) => {
          const rarityOrder: { [key: string]: number } = { 'S': 2, 'A': 1 };
          return (rarityOrder[b.rarity] || 0) - (rarityOrder[a.rarity] || 0);
        });
        break;
    }

    return sorted;
  }

  getFilteredWEngines(): WEngine[] {
    let filtered = this.referenceWEngines;

    // Filter by specialty
    if (this.wengineSpecialtyFilter) {
      filtered = filtered.filter(w => w.specialty === this.wengineSpecialtyFilter);
    }

    // Filter by rarity
    if (this.wengineRarityFilter) {
      filtered = filtered.filter(w => w.rarity === this.wengineRarityFilter);
    }

    // Filter by search term
    if (this.wengineSearchTerm) {
      const searchLower = this.wengineSearchTerm.toLowerCase();
      filtered = filtered.filter(w =>
        w.name.toLowerCase().includes(searchLower) ||
        w.specialty.toLowerCase().includes(searchLower)
      );
    }

    // Sort
    return this.sortWEngines(filtered);
  }

  sortWEngines(wengines: WEngine[]): WEngine[] {
    const sorted = [...wengines];

    switch (this.wengineSortBy) {
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'rarity':
        sorted.sort((a, b) => {
          const rarityOrder: { [key: string]: number } = { 'S': 2, 'A': 1, 'B': 0 };
          return (rarityOrder[b.rarity] || 0) - (rarityOrder[a.rarity] || 0);
        });
        break;
      case 'atk':
        sorted.sort((a, b) => (b.baseAtk || 0) - (a.baseAtk || 0));
        break;
    }

    return sorted;
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

  // Helper to get agent element icon (with special element support)
  getAgentElementIcon(agentId: string): string | undefined {
    const agent = this.referenceAgents.find(a => a.id === agentId);
    if (!agent) return undefined;

    // Use special element icon if available, otherwise use standard element icon
    if (agent.specialElementIcon) {
      return this.dataMappingService.getElementIconPath(agent.specialElementIcon);
    }
    return agent.elementIcon;
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
    // Update filtered disc sets and discs when opening picker
    this.updateFilteredDiscSets();
    this.updateFilteredDiscs();
  }

  openDiscEdit(slot: DiscSlot, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    if (!this.selectedBuild) return;

    // Get the currently equipped disc for this slot
    const equippedDisc = this.selectedBuild.equippedDiscs[slot];
    if (!equippedDisc) return;

    // Find the disc set
    const discSet = this.referenceDiscSets.find(ds => ds.name === equippedDisc.set);
    if (!discSet) return;

    // Set edit mode state
    this.isEditMode = true;
    this.editingDiscUid = equippedDisc.uid;
    this.selectedDiscSlot = slot;
    this.selectedDiscSetForCreation = discSet;

    // Pre-populate form data with existing disc stats
    // Always ensure we have 4 substat slots
    const existingSubStats = equippedDisc.subStats.map(s => ({
      type: s.type,
      value: s.value as string | number  // Keep as number for display
    }));

    // Pad with empty substats to always have 4 slots
    while (existingSubStats.length < 4) {
      existingSubStats.push({ type: 'ATK%', value: '' });
    }

    this.discFormData = {
      mainStatType: equippedDisc.mainStat.type,
      mainStatValue: equippedDisc.mainStat.value,  // Keep as number for display
      subStats: existingSubStats
    };

    // Open the form directly (skip picker)
    this.showDiscForm = true;
    this.showDiscPicker = false;
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

  get4pcEffectBonuses(): string[] {
    if (!this.selectedBuild) return [];
    const agent = this.referenceAgents.find(a => a.id === this.selectedBuild!.agentId);
    if (!agent) return [];

    return this.statCalculator.get4pcEffectBonuses(
      this.selectedBuild.equippedDiscs,
      agent,
      this.selectedBuild.equippedWEngine || null,
      this.selectedBuild.mindscapeLevel || 0,
      this.selectedBuild.wEngineRefinement || 1
    );
  }

  // Disc picker methods

  /**
   * Updates the cached filtered disc sets based on current filter criteria
   * Called when filters change (debounced search terms)
   */
  private updateFilteredDiscSets(): void {
    let filtered = this.referenceDiscSets;

    // Filter by set name
    if (this.discFilterSet) {
      filtered = filtered.filter(s => s.name === this.discFilterSet);
    }

    // Filter by set name search term (debounced)
    if (this.debouncedDiscSearch) {
      const searchLower = this.debouncedDiscSearch.toLowerCase();
      filtered = filtered.filter(s => s.name.toLowerCase().includes(searchLower));
    }

    // Filter by effect search term (debounced)
    if (this.debouncedDiscEffectSearch) {
      const effectSearchLower = this.debouncedDiscEffectSearch.toLowerCase();
      filtered = filtered.filter(s => {
        // Search in bonus descriptions (2pc and 4pc effects)
        return s.bonuses.some(bonus =>
          bonus.description.toLowerCase().includes(effectSearchLower)
        );
      });
    }

    this.cachedFilteredDiscSets = filtered;
  }

  /**
   * Returns cached filtered disc sets (used in template)
   * This is fast because it just returns the pre-computed array
   */
  getFilteredDiscSets(): DiscSet[] {
    return this.cachedFilteredDiscSets;
  }

  /**
   * Updates the cached filtered discs based on current filter criteria
   * Called when filters change
   */
  private updateFilteredDiscs(): void {
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

    this.cachedFilteredDiscs = filtered;
  }

  /**
   * Returns cached filtered discs (used in template)
   * This is fast because it just returns the pre-computed array
   */
  getFilteredDiscs(): Disc[] {
    return this.cachedFilteredDiscs;
  }

  async equipDiscToBuild(disc: Disc) {
    if (!this.selectedBuild || !this.selectedDiscSlot || this.isProcessingDiscAction) return;

    this.isProcessingDiscAction = true;

    try {
      await this.buildService.equipDisc(this.selectedBuild.id, disc);
      this.closeDiscPicker();
    } catch (error) {
      console.error('Error equipping disc:', error);
      alert('Error equipping disc');
    } finally {
      this.isProcessingDiscAction = false;
    }
  }

  selectDiscSet(discSet: DiscSet) {
    if (this.isProcessingDiscAction) return;

    this.selectedDiscSetForCreation = discSet;
    this.showDiscPicker = false;
    this.showDiscForm = true;

    // Only reset form if we're not in edit mode
    // If we're editing and changing set, preserve the form data
    if (!this.isEditMode) {
      this.discFormData = {
        mainStatType: '',
        mainStatValue: '',
        subStats: [
          { type: 'ATK%', value: '' },
          { type: 'ATK%', value: '' },
          { type: 'ATK%', value: '' },
          { type: 'ATK%', value: '' }
        ]
      };
    }
  }

  closeDiscForm() {
    this.showDiscForm = false;
    this.selectedDiscSetForCreation = null;
    this.isEditMode = false;
    this.editingDiscUid = null;
    this.discFormData = {
      mainStatType: '',
      mainStatValue: '',
      subStats: [
        { type: 'ATK%', value: '' },
        { type: 'ATK%', value: '' },
        { type: 'ATK%', value: '' },
        { type: 'ATK%', value: '' }
      ]
    };
  }

  async createAndEquipDisc() {
    if (!this.selectedBuild || !this.selectedDiscSlot || !this.selectedDiscSetForCreation || this.isProcessingDiscAction) return;

    this.isProcessingDiscAction = true;

    // For slots 1-3, use fixed values. For slots 4-6, use user input
    let mainStatType: MainStatType;
    let mainStatValue: number;

    if (this.selectedDiscSlot === 'Drive1' || this.selectedDiscSlot === 'Drive2' || this.selectedDiscSlot === 'Drive3') {
      // Fixed main stats for slots 1-3
      mainStatType = this.getDefaultMainStatForSlot(this.selectedDiscSlot);
      mainStatValue = this.getMainStatValueForSlot(this.selectedDiscSlot);
    } else {
      // User input for slots 4-6
      mainStatType = this.discFormData.mainStatType as MainStatType;
      // Convert string to number if needed
      mainStatValue = typeof this.discFormData.mainStatValue === 'string'
        ? parseFloat(this.discFormData.mainStatValue) || 0
        : this.discFormData.mainStatValue;
    }

    try {
      if (this.isEditMode && this.editingDiscUid) {
        // UPDATE MODE: Modify existing disc
        const updates: Partial<Disc> = {
          set: this.selectedDiscSetForCreation.name,
          mainStat: {
            type: mainStatType,
            value: mainStatValue
          },
          subStats: this.discFormData.subStats.map(s => ({
            type: s.type as SubStatType,
            value: typeof s.value === 'string' ? parseFloat(s.value) || 0 : s.value
          }))
        };

        // Update in inventory
        await this.discService.updateDisc(this.editingDiscUid, updates);

        // Get the updated disc from inventory
        const updatedDisc = this.discService.getDiscById(this.editingDiscUid);
        if (updatedDisc) {
          // Update the build's equippedDiscs with the updated disc
          const currentDiscs = { ...this.selectedBuild.equippedDiscs };
          currentDiscs[this.selectedDiscSlot] = updatedDisc;
          await this.buildService.updateBuild(this.selectedBuild.id, {
            equippedDiscs: currentDiscs
          });
        }
      } else {
        // CREATE MODE: Create new disc
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
            type: s.type as SubStatType,
            value: typeof s.value === 'string' ? parseFloat(s.value) || 0 : s.value
          })),
          lock: false
        };

        // Add disc to inventory
        await this.discService.addDisc(newDisc);
        // Equip it to the build
        await this.buildService.equipDisc(this.selectedBuild.id, newDisc);
      }

      this.closeDiscForm();
    } catch (error) {
      console.error('Error creating/updating disc:', error);
      alert(this.isEditMode ? 'Error updating disc' : 'Error creating disc');
    } finally {
      this.isProcessingDiscAction = false;
    }
  }

  getDefaultMainStatForSlot(slot: DiscSlot): MainStatType {
    // Discs 1-3 have fixed main stats, 4-6 are flexible
    const defaults: { [key in DiscSlot]: MainStatType } = {
      'Drive1': 'HP',
      'Drive2': 'ATK',
      'Drive3': 'DEF',
      'Drive4': 'ATK%',
      'Drive5': 'Element_DMG',
      'Drive6': 'ATK%'
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

  // Disc scoring methods
  getDiscScore(disc: Disc): { score: number, rating: DiscRating } | null {
    if (!this.selectedBuild) return null;

    // Wait for scoring service to load data before calculating
    if (!this.scoringService.areBreakpointsLoaded()) {
      return null;
    }

    // Get equipped discs as array for hybrid agent detection
    const equippedDiscsArray = Object.values(this.selectedBuild.equippedDiscs).filter(d => d !== undefined);

    const result = this.scoringService.calculateDiscScore(
      disc,
      this.selectedBuild.agentId,
      equippedDiscsArray
    );
    return {
      score: result.score,
      rating: result.rating
    };
  }

  getDiscRatingClass(rating: DiscRating): string {
    return `rating-${rating.grade.toLowerCase().replace(/\s+/g, '-')}`;
  }

  // Build scoring methods
  getBuildScore(): { score: number, rating: BuildRating } | null {
    if (!this.selectedBuild) return null;

    // Wait for scoring service to load data before calculating
    if (!this.scoringService.areBreakpointsLoaded()) {
      return null;
    }

    // Get equipped discs as array
    const equippedDiscsArray = Object.values(this.selectedBuild.equippedDiscs).filter(d => d !== undefined);

    // Get agent info for damage estimation
    const agent = this.referenceAgents.find(a => a.id === this.selectedBuild!.agentId);

    // Use composite scoring which accounts for disc quality, W-Engine, Mindscape, set bonuses, and damage estimation
    const result = this.scoringService.calculateCompositeBuildScore(
      this.selectedBuild.agentId,
      this.selectedBuild.calculatedStats,
      equippedDiscsArray,
      this.selectedBuild.equippedWEngine || undefined,
      this.selectedBuild.wEngineRefinement || 1,
      this.selectedBuild.mindscapeLevel || 0,
      agent?.name,
      agent?.specialty,
      agent?.element,
      60 // Default level 60, can be updated later
    );

    return {
      score: result.score,
      rating: result.rating
    };
  }

  getBuildRatingClass(rating: BuildRating): string {
    return `rating-${rating.grade.toLowerCase().replace(/\s+/g, '-')}`;
  }

  // Input validation and formatting methods
  validateAndFormatMainStat(): void {
    const value = this.discFormData.mainStatValue;
    if (typeof value === 'string') {
      // Remove any non-numeric characters except decimal point and negative sign
      const cleaned = value.replace(/[^\d.-]/g, '');
      const parsed = parseFloat(cleaned);

      if (isNaN(parsed)) {
        this.discFormData.mainStatValue = 0;
      } else {
        // Round to 1 decimal place
        this.discFormData.mainStatValue = Math.round(parsed * 10) / 10;
      }
    }
  }

  validateAndFormatSubStat(index: number): void {
    const subStat = this.discFormData.subStats[index];
    if (!subStat) return;

    const value = subStat.value;
    if (typeof value === 'string') {
      // Remove any non-numeric characters except decimal point and negative sign
      const cleaned = value.replace(/[^\d.-]/g, '');
      const parsed = parseFloat(cleaned);

      if (isNaN(parsed)) {
        subStat.value = 0;
      } else {
        // Round to 1 decimal place
        subStat.value = Math.round(parsed * 10) / 10;
      }
    }
  }

  // Image preloading methods
  private preloadAgentImages(agents: Agent[]): void {
    if (!agents || agents.length === 0) {
      return; // Don't preload if no agents yet
    }

    const imageUrls = agents
      .map(agent => agent.icon)
      .filter(icon => icon) as string[];

    this.imagePreloader.preloadImages(imageUrls).then(() => {
      console.log(`Preloaded ${imageUrls.length} agent images`);
    });
  }

  private preloadWEngineImages(wEngines: WEngine[]): void {
    if (!wEngines || wEngines.length === 0) {
      return; // Don't preload if no W-Engines yet
    }

    const imageUrls = wEngines
      .map(engine => engine.icon)
      .filter(icon => icon) as string[];

    this.imagePreloader.preloadImages(imageUrls).then(() => {
      console.log(`Preloaded ${imageUrls.length} W-Engine images`);
    });
  }

  private preloadDiscSetImages(discSets: DiscSet[]): void {
    if (!discSets || discSets.length === 0) {
      return; // Don't preload if no disc sets yet
    }

    const imageUrls = discSets
      .map(discSet => discSet.icon)
      .filter(icon => icon) as string[];

    this.imagePreloader.preloadImages(imageUrls).then(() => {
      console.log(`Preloaded ${imageUrls.length} disc set images`);
    });
  }

  // Text formatting helpers for consistent UI display
  formatStatType(statType: string): string {
    if (!statType) return '';

    // Replace underscores with spaces
    let formatted = statType.replace(/_/g, ' ');

    return formatted;
  }

  formatDiscSlot(slot: DiscSlot): string {
    // Convert "Drive1" to "Drive 1", "Drive2" to "Drive 2", etc.
    return slot.replace(/(\D+)(\d+)/, '$1 $2');
  }

  // Debounced search handlers
  onDiscSearchChange(searchTerm: string) {
    this.discSearchSubject$.next(searchTerm);
  }

  onDiscEffectSearchChange(searchTerm: string) {
    this.discEffectSearchSubject$.next(searchTerm);
  }

  // Confirmation dialog methods
  showConfirmation(title: string, message: string, onConfirm: () => void, confirmText = 'Confirm', cancelText = 'Cancel') {
    this.confirmDialogData = {
      title,
      message,
      confirmText,
      cancelText,
      onConfirm
    };
    this.showConfirmDialog = true;
  }

  confirmAction() {
    this.confirmDialogData.onConfirm();
    this.closeConfirmDialog();
  }

  closeConfirmDialog() {
    this.showConfirmDialog = false;
  }

  // Keyboard shortcuts handler
  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    // Esc key - close any open modal
    if (event.key === 'Escape') {
      if (this.showConfirmDialog) {
        this.closeConfirmDialog();
        event.preventDefault();
      } else if (this.showAddAgentModal) {
        this.closeAddAgentModal();
        event.preventDefault();
      } else if (this.showDiscPicker) {
        this.closeDiscPicker();
        event.preventDefault();
      } else if (this.showDiscForm) {
        this.closeDiscForm();
        event.preventDefault();
      } else if (this.showWEnginePicker) {
        this.showWEnginePicker = false;
        event.preventDefault();
      }
    }

    // Enter key - confirm action in modals
    if (event.key === 'Enter' && !event.shiftKey) {
      if (this.showConfirmDialog) {
        this.confirmAction();
        event.preventDefault();
      } else if (this.showAddAgentModal && this.selectedAgentForAdd) {
        this.addAgentBuild();
        event.preventDefault();
      } else if (this.showDiscForm) {
        this.createAndEquipDisc();
        event.preventDefault();
      }
    }
  }

  // TrackBy functions for performance optimization
  trackByBuildId(_index: number, build: AgentBuild): string {
    return build.id;
  }

  trackByMindscapeLevel(_index: number, level: number): number {
    return level;
  }

  trackByAgentId(_index: number, agent: Agent): string {
    return agent.id;
  }

  trackByWEngineId(_index: number, wEngine: WEngine): string {
    return wEngine.id;
  }

  trackByDiscSlot(_index: number, slot: DiscSlot): string {
    return slot;
  }

  trackByDiscSetName(_index: number, discSet: DiscSet): string {
    return discSet.name;
  }

  trackBySubStatIndex(index: number, _subStat: unknown): number {
    return index;
  }

  trackByBonusIndex(index: number, _bonus: unknown): number {
    return index;
  }
}
