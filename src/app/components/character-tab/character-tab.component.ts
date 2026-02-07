import {
  Component,
  OnInit,
  OnDestroy,
  HostListener,
  ViewChild,
  ElementRef,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScrollingModule } from '@angular/cdk/scrolling';
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
import {
  DiscRating,
  BuildRating,
  FeedbackItem,
} from '../../constants/disc-scoring';
import {
  DISC_MAIN_STAT_MAX,
  MAIN_STAT_BY_SLOT,
} from '../../constants/main-stat-possibilities';
import { OptimizerComponent } from '../optimizer/optimizer.component';
import { EnkaApiService } from '../../services/enka-api.service';
import { EnkaImportService } from '../../services/enka-import.service';
import { UpgradePlanService } from '../../services/upgrade-plan.service';
import { LoadingService } from '../../services/loading.service';
import { UpgradePlan } from '../../models/upgrade-plan.model';
import { calculateRollCount } from '../../constants/substat-rolls';
import { UpgradePlansComponent } from '../upgrade-plans/upgrade-plans.component';
import {
  CanvasShareImageService,
  ShareImageData,
} from '../../services/canvas-share-image.service';

@Component({
  selector: 'app-character-tab',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ScrollingModule,
    OptimizerComponent,
    UpgradePlansComponent,
  ],
  templateUrl: './character-tab.component.html',
  styleUrls: ['./character-tab.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CharacterTabComponent implements OnInit, OnDestroy {
  // User builds (not reference data!)
  builds: AgentBuild[] = [];
  selectedBuild: AgentBuild | null = null;

  // Active tab
  activeTab: 'builds' | 'upgrade-plans' | 'optimizer' = 'builds';

  // Available upgrade plans (stored locally for change detection)
  availablePlans: UpgradePlan[] = [];

  // Reference data for adding new builds
  referenceAgents: Agent[] = [];
  referenceWEngines: WEngine[] = [];
  referenceDiscSets: DiscSet[] = [];

  // UI state
  showAddAgentModal = false;
  selectedAgentForAdd: Agent | null = null;
  showDiscPicker = false;
  selectedDiscSlot: DiscSlot | null = null;
  showShareModal = false;

  @ViewChild('shareCanvas') shareCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('shareCard') shareCardRef!: ElementRef<HTMLDivElement>;

  // Bonus enable/disable toggles (for stat calculations)
  includeWEngineBonuses = true;
  includeMindscapeBonuses = true;
  includePassiveBonuses = true;

  // Disc creation state
  showDiscForm = false;
  selectedDiscSetForCreation: DiscSet | null = null;
  editingDiscUid: string | null = null; // Track which disc is being edited
  isEditMode: boolean = false; // Track if we're editing vs creating
  discFormData = {
    mainStatType: '', // Only used for slots 4-6
    mainStatValue: '' as string | number, // Can be string for input, number for processing
    subStats: [] as Array<{ type: string; value: string | number }>,
  };

  // Disc slots
  discSlots: DiscSlot[] = [
    'Drive1',
    'Drive2',
    'Drive3',
    'Drive4',
    'Drive5',
    'Drive6',
  ];

  // Available substat types (for dropdown options)
  availableSubStatTypes: Array<{ value: SubStatType; label: string }> = [
    { value: 'HP', label: 'HP' },
    { value: 'HP%', label: 'HP%' },
    { value: 'ATK', label: 'ATK' },
    { value: 'ATK%', label: 'ATK%' },
    { value: 'DEF', label: 'DEF' },
    { value: 'DEF%', label: 'DEF%' },
    { value: 'CRIT_Rate', label: 'CRIT Rate' },
    { value: 'CRIT_DMG', label: 'CRIT DMG' },
    { value: 'Anomaly_Proficiency', label: 'Anomaly Proficiency' },
    { value: 'PEN', label: 'PEN (Flat)' },
  ];

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

  // OPTIMIZATION: Memoization caches for score calculations
  private discScoreCache = new Map<string, { score: number; rating: DiscRating }>();
  private buildScoreCache = new Map<string, { score: number; rating: BuildRating }>();

  // OPTIMIZATION: Cached results for expensive template functions
  private cachedSubstatBreakdown: ReturnType<typeof this.computeSubstatBreakdown> | null = null;
  private cachedMindscapeBonuses: ReturnType<typeof this.computeMindscapeBonuses> | null = null;
  private cachedPassiveBonuses: ReturnType<typeof this.computePassiveBonuses> | null = null;
  private cachedWEngineRefinementBonuses: ReturnType<typeof this.computeWEngineRefinementBonuses> | null = null;
  private cachedFilteredAgents: Agent[] | null = null;
  private cachedFilteredWEngines: WEngine[] | null = null;
  private lastAgentFilterKey = '';
  private lastWEngineFilterKey = '';
  private lastBuildStateKey = '';

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
    onConfirm: () => {},
  };

  // Enka UID Import
  showEnkaImportModal = false;
  enkaUid = '';
  isImportingFromEnka = false;
  enkaImportError = '';
  enkaImportSuccess = '';
  uidHistory: Array<{ uid: string; username: string }> = [];
  showUidHistoryDropdown = false;
  private readonly UID_HISTORY_KEY = 'zzz_uid_history';
  private readonly MAX_UID_HISTORY = 10;

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
    private dataMappingService: DataMappingService,
    private enkaApiService: EnkaApiService,
    private enkaImportService: EnkaImportService,
    private upgradePlanService: UpgradePlanService,
    private canvasShareImageService: CanvasShareImageService,
    private loadingService: LoadingService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    // Load UID history from local storage
    this.loadUidHistory();

    // Subscribe to user builds
    this.buildService.builds$
      .pipe(takeUntil(this.destroy$))
      .subscribe((builds) => {
        this.builds = builds;
        // Auto-select first build if none selected
        if (builds.length > 0 && !this.selectedBuild) {
          this.selectBuild(builds[0]);
        }
        this.cdr.markForCheck();
      });

    // Subscribe to selected build
    this.buildService.selectedBuild$
      .pipe(takeUntil(this.destroy$))
      .subscribe(async (build) => {
        this.selectedBuild = build;
        this.invalidateBuildCaches();

        // Load toggle flags from build (default true if not set)
        if (build) {
          this.includeWEngineBonuses = build.includeWEngineBonuses ?? true;
          this.includeMindscapeBonuses = build.includeMindscapeBonuses ?? true;
          this.includePassiveBonuses = build.includePassiveBonuses ?? true;
        }
        this.cdr.markForCheck();
      });

    // Subscribe to upgrade plans to keep dropdown updated
    this.upgradePlanService.plans$
      .pipe(takeUntil(this.destroy$))
      .subscribe((plans) => {
        // Store plans locally so Angular knows to update the dropdown
        // Create new array reference to ensure change detection
        this.availablePlans = [...plans];
        this.cdr.markForCheck();
      });

    // Load reference agents for the "Add Agent" modal
    this.agentService.agents$
      .pipe(takeUntil(this.destroy$))
      .subscribe((agents) => {
        this.referenceAgents = agents;
        // Preload agent images
        this.preloadAgentImages(agents);
        this.cdr.markForCheck();
      });

    // Load reference W-Engines
    this.wEngineService.wEngines$
      .pipe(takeUntil(this.destroy$))
      .subscribe((wEngines) => {
        this.referenceWEngines = wEngines;
        // Preload W-Engine images
        this.preloadWEngineImages(wEngines);
        this.cdr.markForCheck();
      });

    // Load reference disc sets
    this.discSetService.discSets$
      .pipe(takeUntil(this.destroy$))
      .subscribe((discSets) => {
        this.referenceDiscSets = discSets;
        // Initialize cached filtered disc sets
        this.updateFilteredDiscSets();
        // Preload disc set images
        this.preloadDiscSetImages(discSets);
        this.cdr.markForCheck();
      });

    // Load user disc inventory
    this.discService.discs$
      .pipe(takeUntil(this.destroy$))
      .subscribe((discs) => {
        this.allDiscs = discs;
        // Update cached filtered discs whenever inventory changes
        this.updateFilteredDiscs();
        this.cdr.markForCheck();
      });

    // Set up debounced search for disc set name
    this.discSearchSubject$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((searchTerm) => {
        this.debouncedDiscSearch = searchTerm;
        this.updateFilteredDiscSets();
        this.cdr.markForCheck();
      });

    // Set up debounced search for disc effects
    this.discEffectSearchSubject$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((searchTerm) => {
        this.debouncedDiscEffectSearch = searchTerm;
        this.updateFilteredDiscSets();
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  selectBuild(build: AgentBuild) {
    this.buildService.selectBuild(build);
    this.clearFeedbackCache();
  }

  openAddAgentModal() {
    this.previouslyFocusedElement = document.activeElement as HTMLElement;
    this.showAddAgentModal = true;
    this.selectedAgentForAdd = null;
    // Focus first interactive element after modal renders
    setTimeout(() => {
      const firstFocusable = document.querySelector(
        '.modal-content button, .modal-content input, .modal-content select',
      ) as HTMLElement;
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
    this.cdr.markForCheck();
  }

  selectAgentForAdd(agent: Agent) {
    this.selectedAgentForAdd = agent;
    this.cdr.markForCheck();
  }

  async addAgentBuild() {
    if (!this.selectedAgentForAdd || this.isProcessingAgentAction) {
      return;
    }

    // Check if this agent already has a build
    const existingBuild = this.builds.find(
      (b) => b.agentId === this.selectedAgentForAdd!.id,
    );
    if (existingBuild) {
      alert(
        `You already have a build for ${this.selectedAgentForAdd.name}. Each agent can only have one build.`,
      );
      return;
    }

    this.isProcessingAgentAction = true;

    try {
      const newBuild = await this.buildService.createBuild(
        this.selectedAgentForAdd,
        0,
      );
      this.closeAddAgentModal();
      this.selectBuild(newBuild);
    } catch (error) {
      console.error('Error creating build:', error);
      alert('Error creating build');
    } finally {
      this.isProcessingAgentAction = false;
      this.cdr.markForCheck();
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
      'Cancel',
    );
  }

  toggleMindscape(level: number) {
    if (!this.selectedBuild) return;

    // Mindscape levels work cumulatively (M1 through M6)
    // - Clicking a level ON: activates that level and all previous levels (M1 through that level)
    // - Clicking a level OFF: deactivates that level and all higher levels (keeps lower ones)
    let newLevel: number;

    if (this.selectedBuild.mindscapeLevel >= level) {
      // Clicking an active mindscape - deselect it and all above it
      newLevel = level - 1;
    } else {
      // Clicking an inactive mindscape - select up to this level
      newLevel = level;
    }

    this.buildService.updateBuild(this.selectedBuild.id, {
      mindscapeLevel: newLevel,
    });
    this.cdr.markForCheck();
  }

  async onWEngineBonusesToggle() {
    // Update build with new toggle state and recalculate
    if (this.selectedBuild) {
      await this.buildService.updateBuild(this.selectedBuild.id, {
        includeWEngineBonuses: this.includeWEngineBonuses,
      });
      this.clearScoreCaches(); // OPTIMIZATION: Clear caches when stats change
    }
  }

  async onMindscapeBonusesToggle() {
    // Update build with new toggle state and recalculate
    if (this.selectedBuild) {
      await this.buildService.updateBuild(this.selectedBuild.id, {
        includeMindscapeBonuses: this.includeMindscapeBonuses,
      });
      this.clearScoreCaches(); // OPTIMIZATION: Clear caches when stats change
    }
  }

  async onPassiveBonusesToggle() {
    // Update build with new toggle state and recalculate
    if (this.selectedBuild) {
      await this.buildService.updateBuild(this.selectedBuild.id, {
        includePassiveBonuses: this.includePassiveBonuses,
      });
      this.clearScoreCaches(); // OPTIMIZATION: Clear caches when stats change
    }
  }

  isDiscEnabled(slot: DiscSlot): boolean {
    if (!this.selectedBuild) return true;
    // Default to true if not explicitly set
    return this.selectedBuild.enabledDiscs?.[slot] ?? true;
  }

  async onDiscToggle(slot: DiscSlot) {
    if (!this.selectedBuild) return;

    // Initialize enabledDiscs if it doesn't exist
    if (!this.selectedBuild.enabledDiscs) {
      this.selectedBuild.enabledDiscs = {};
    }

    // Toggle the disc's enabled state
    const currentState = this.selectedBuild.enabledDiscs[slot] ?? true;
    const newState = !currentState;

    // Update the enabledDiscs object
    const updatedEnabledDiscs = {
      ...this.selectedBuild.enabledDiscs,
      [slot]: newState,
    };

    // Update build with new enabled state and recalculate stats
    await this.buildService.updateBuild(this.selectedBuild.id, {
      enabledDiscs: updatedEnabledDiscs,
    });
    this.clearScoreCaches(); // OPTIMIZATION: Clear caches when disc is toggled
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
        await new Promise((resolve) => setTimeout(resolve, 50));

        this.showWEnginePicker = false;
        return;
      }

      const wEngine = this.referenceWEngines.find((w) => w.id === wEngineId);
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
        wEngineRefinement: level,
      });

      // Refresh the selected build
      const updatedBuild = this.buildService.getBuildById(
        this.selectedBuild.id,
      );
      if (updatedBuild) {
        this.selectedBuild = updatedBuild;
      }
    } catch (error) {
      console.error('Error setting W-Engine refinement:', error);
    }
  }

  getSpecialtyIcon(specialty: string): string {
    const specialtyMap: { [key: string]: string } = {
      Attack: 'assets/data/images/roles/IconAttackType.webp',
      Stun: 'assets/data/images/roles/IconStun.webp',
      Anomaly: 'assets/data/images/roles/IconAnomaly.webp',
      Support: 'assets/data/images/roles/IconSupport.webp',
      Defense: 'assets/data/images/roles/IconDefense.webp',
      Rupture: 'assets/data/images/roles/IconRupture.webp',
    };
    return (
      specialtyMap[specialty] || 'assets/data/images/roles/IconAttackType.webp'
    );
  }

  getFilteredAgents(): Agent[] {
    const filterKey = `${this.referenceAgents.length}|${this.agentElementFilter}|${this.agentSpecialtyFilter}|${this.agentRarityFilter}|${this.agentSortBy}`;
    if (this.cachedFilteredAgents && this.lastAgentFilterKey === filterKey) {
      return this.cachedFilteredAgents;
    }

    let filtered = this.referenceAgents;

    if (this.agentElementFilter) {
      filtered = filtered.filter((a) => a.element === this.agentElementFilter);
    }
    if (this.agentSpecialtyFilter) {
      filtered = filtered.filter(
        (a) => a.specialty === this.agentSpecialtyFilter,
      );
    }
    if (this.agentRarityFilter) {
      filtered = filtered.filter((a) => a.rarity === this.agentRarityFilter);
    }

    this.cachedFilteredAgents = this.sortAgents(filtered);
    this.lastAgentFilterKey = filterKey;
    return this.cachedFilteredAgents;
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
          const rarityOrder: { [key: string]: number } = { S: 2, A: 1 };
          return (rarityOrder[b.rarity] || 0) - (rarityOrder[a.rarity] || 0);
        });
        break;
    }

    return sorted;
  }

  getFilteredWEngines(): WEngine[] {
    const filterKey = `${this.referenceWEngines.length}|${this.wengineSpecialtyFilter}|${this.wengineRarityFilter}|${this.wengineSearchTerm}|${this.wengineSortBy}`;
    if (this.cachedFilteredWEngines && this.lastWEngineFilterKey === filterKey) {
      return this.cachedFilteredWEngines;
    }

    let filtered = this.referenceWEngines;

    if (this.wengineSpecialtyFilter) {
      filtered = filtered.filter(
        (w) => w.specialty === this.wengineSpecialtyFilter,
      );
    }
    if (this.wengineRarityFilter) {
      filtered = filtered.filter((w) => w.rarity === this.wengineRarityFilter);
    }
    if (this.wengineSearchTerm) {
      const searchLower = this.wengineSearchTerm.toLowerCase();
      filtered = filtered.filter(
        (w) =>
          w.name.toLowerCase().includes(searchLower) ||
          w.specialty.toLowerCase().includes(searchLower),
      );
    }

    this.cachedFilteredWEngines = this.sortWEngines(filtered);
    this.lastWEngineFilterKey = filterKey;
    return this.cachedFilteredWEngines;
  }

  sortWEngines(wengines: WEngine[]): WEngine[] {
    const sorted = [...wengines];

    switch (this.wengineSortBy) {
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'rarity':
        sorted.sort((a, b) => {
          const rarityOrder: { [key: string]: number } = { S: 2, A: 1, B: 0 };
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

    const agent = this.referenceAgents.find(
      (a) => a.id === this.selectedBuild!.agentId,
    );
    if (!agent) {
      return false;
    }

    return agent.specialty === this.selectedBuild!.equippedWEngine!.specialty;
  }

  // OPTIMIZATION: Key that changes whenever build state changes — used to invalidate all build-dependent caches
  private getBuildStateKey(): string {
    if (!this.selectedBuild) return '';
    const discUids = Object.entries(this.selectedBuild.equippedDiscs || {})
      .filter(([, d]) => d)
      .map(([slot, d]) => `${slot}:${d!.uid}`)
      .sort()
      .join(',');
    return `${this.selectedBuild.id}|${this.selectedBuild.equippedWEngine?.id || ''}|${this.selectedBuild.wEngineRefinement || 1}|${this.selectedBuild.mindscapeLevel || 0}|${discUids}|${this.selectedBuild.enabledDiscs ? JSON.stringify(this.selectedBuild.enabledDiscs) : ''}`;
  }

  getWEngineRefinementBonuses(): Array<{
    name: string;
    value: string;
    isPercent: boolean;
  }> {
    const key = this.getBuildStateKey();
    if (this.cachedWEngineRefinementBonuses && this.lastBuildStateKey === key) {
      return this.cachedWEngineRefinementBonuses;
    }
    this.cachedWEngineRefinementBonuses = this.computeWEngineRefinementBonuses();
    this.lastBuildStateKey = key;
    return this.cachedWEngineRefinementBonuses;
  }

  private computeWEngineRefinementBonuses(): Array<{
    name: string;
    value: string;
    isPercent: boolean;
  }> {
    if (
      !this.selectedBuild ||
      !this.selectedBuild.equippedWEngine ||
      !this.selectedBuild.equippedWEngine.effect.properties
    ) {
      return [];
    }

    const refinementKey = `W${this.selectedBuild.wEngineRefinement}` as
      | 'W1'
      | 'W2'
      | 'W3'
      | 'W4'
      | 'W5';

    return this.selectedBuild.equippedWEngine.effect.properties.map((prop) => {
      const value = prop.values[refinementKey];
      const isPercent =
        prop.type !== 'Impact' && prop.type !== 'Anomaly_Proficiency';

      return {
        name: prop.name,
        value: value.toFixed(1),
        isPercent: isPercent,
      };
    });
  }

  getMindscapeBonuses(): Array<{
    level: number;
    name: string;
    stats: Array<{ name: string; value: string; isPercent: boolean }>;
  }> {
    const key = this.getBuildStateKey();
    if (this.cachedMindscapeBonuses && this.lastBuildStateKey === key) {
      return this.cachedMindscapeBonuses;
    }
    this.cachedMindscapeBonuses = this.computeMindscapeBonuses();
    this.lastBuildStateKey = key;
    return this.cachedMindscapeBonuses;
  }

  private computeMindscapeBonuses(): Array<{
    level: number;
    name: string;
    stats: Array<{ name: string; value: string; isPercent: boolean }>;
  }> {
    if (!this.selectedBuild || this.selectedBuild.mindscapeLevel === 0) {
      return [];
    }

    const agent = this.referenceAgents.find(
      (a) => a.id === this.selectedBuild!.agentId,
    );
    if (!agent || !agent.mindscapeEffects) {
      return [];
    }

    const activeMindscapes = agent.mindscapeEffects.filter(
      (m) =>
        m.level <= this.selectedBuild!.mindscapeLevel &&
        m.statBonuses &&
        m.statBonuses.length > 0 &&
        m.statBonuses.some((b) => !b.conditional),
    );

    return activeMindscapes.map((mindscape) => {
      const stats = mindscape
        .statBonuses!.filter((b) => !b.conditional)
        .map((bonus) => {
          const isPercent = bonus.format === '%';

          let displayName: string;
          switch (bonus.type) {
            case 'ATK%':
              displayName = 'ATK';
              break;
            case 'HP%':
              displayName = 'HP';
              break;
            case 'DEF%':
              displayName = 'DEF';
              break;
            case 'CRIT_Rate':
              displayName = 'CRIT Rate';
              break;
            case 'CRIT_DMG':
              displayName = 'CRIT DMG';
              break;
            case 'PEN_Ratio':
              displayName = 'PEN Ratio';
              break;
            case 'Energy_Regen':
              displayName = 'Energy Regen';
              break;
            case 'Anomaly_Proficiency':
              displayName = 'Anomaly Proficiency';
              break;
            case 'Anomaly_Mastery':
              displayName = 'Anomaly Mastery';
              break;
            case 'Impact':
              displayName = 'Impact';
              break;
            default:
              displayName = bonus.type;
              break;
          }

          return {
            name: displayName,
            value: bonus.value.toFixed(1),
            isPercent: isPercent,
          };
        });

      return {
        level: mindscape.level,
        name: mindscape.name,
        stats: stats,
      };
    });
  }

  getPassiveBonuses(): Array<{
    name: string;
    value: string;
    isPercent: boolean;
  }> {
    const key = this.getBuildStateKey();
    if (this.cachedPassiveBonuses && this.lastBuildStateKey === key) {
      return this.cachedPassiveBonuses;
    }
    this.cachedPassiveBonuses = this.computePassiveBonuses();
    this.lastBuildStateKey = key;
    return this.cachedPassiveBonuses;
  }

  private computePassiveBonuses(): Array<{
    name: string;
    value: string;
    isPercent: boolean;
  }> {
    if (!this.selectedBuild) {
      return [];
    }

    const agent = this.referenceAgents.find(
      (a) => a.id === this.selectedBuild!.agentId,
    );
    if (!agent || !agent.scoring?.buffs) {
      return [];
    }

    return agent.scoring.buffs
      .map((buff) => {
        const isPercent = buff.format === '%';

        let displayName: string | undefined;
        switch (buff.type) {
          case 'ATKBonus':
            displayName = 'ATK';
            break;
          case 'HPBonus':
            displayName = 'HP';
            break;
          case 'DEFBonus':
            displayName = 'DEF';
            break;
          case 'CRITRateBonus':
            displayName = 'CRIT Rate';
            break;
          case 'CRITDMGBonus':
            displayName = 'CRIT DMG';
            break;
          case 'PENRatioBonus':
            displayName = 'PEN Ratio';
            break;
          case 'AnomalyProficiencyBonus':
          case 'AnomalyProficiency':
            displayName = 'Anomaly Proficiency';
            break;
          case 'AnomalyMasteryBonus':
          case 'AnomalyMastery':
            displayName = 'Anomaly Mastery';
            break;
          case 'ImpactBonus':
            displayName = 'Impact';
            break;
          case 'EnergyRegenBonus':
            displayName = 'Energy Regen';
            break;
        }

        if (!displayName) {
          return;
        }

        return {
          name: displayName,
          value: buff.value,
          isPercent: isPercent,
        };
      })
      .filter(
        (b): b is { name: string; value: string; isPercent: boolean } =>
          b !== undefined,
      );
  }

  getSubstatBreakdown(): Array<{
    name: string;
    value: string;
    isPercent: boolean;
    rollCount: number;
    isPriority: boolean;
  }> {
    const key = this.getBuildStateKey();
    if (this.cachedSubstatBreakdown && this.lastBuildStateKey === key) {
      return this.cachedSubstatBreakdown;
    }
    this.cachedSubstatBreakdown = this.computeSubstatBreakdown();
    this.lastBuildStateKey = key;
    return this.cachedSubstatBreakdown;
  }

  private computeSubstatBreakdown(): Array<{
    name: string;
    value: string;
    isPercent: boolean;
    rollCount: number;
    isPriority: boolean;
  }> {
    if (!this.selectedBuild || !this.selectedBuild.equippedDiscs) {
      return [];
    }

    const substatTotals: { [key: string]: number } = {};
    const rollCounts: { [key: string]: number } = {};
    const enabledDiscs = this.selectedBuild.enabledDiscs || {};

    const agentBreakpoints = this.scoringService.getAgentBreakpoints(
      this.selectedBuild.agentId,
    );
    const priorityStats = agentBreakpoints?.priorityStats || [];

    Object.entries(this.selectedBuild.equippedDiscs).forEach(([slot, disc]) => {
      const isEnabled = enabledDiscs[slot] ?? true;

      if (disc && disc.subStats && isEnabled) {
        disc.subStats.forEach((subStat) => {
          if (!substatTotals[subStat.type]) {
            substatTotals[subStat.type] = 0;
            rollCounts[subStat.type] = 0;
          }
          substatTotals[subStat.type] += subStat.value;
          const rollCount =
            subStat.rolls || calculateRollCount(subStat.type, subStat.value);
          rollCounts[subStat.type] += rollCount;
        });
      }
    });

    const result = Object.entries(substatTotals).map(([type, value]) => {
      const isPercent =
        type.includes('%') ||
        ['CRIT_Rate', 'CRIT_DMG', 'HP%', 'ATK%', 'DEF%'].includes(type);

      let displayName: string;
      switch (type) {
        case 'HP':
          displayName = 'Flat HP';
          break;
        case 'HP%':
          displayName = 'HP';
          break;
        case 'ATK':
          displayName = 'Flat ATK';
          break;
        case 'ATK%':
          displayName = 'ATK';
          break;
        case 'DEF':
          displayName = 'Flat DEF';
          break;
        case 'DEF%':
          displayName = 'DEF';
          break;
        case 'CRIT_Rate':
          displayName = 'CRIT Rate';
          break;
        case 'CRIT_DMG':
          displayName = 'CRIT DMG';
          break;
        case 'Anomaly_Proficiency':
          displayName = 'Anomaly Proficiency';
          break;
        case 'Anomaly_Mastery':
          displayName = 'Anomaly Mastery';
          break;
        case 'PEN':
          displayName = 'PEN';
          break;
        case 'Impact':
          displayName = 'Impact';
          break;
        case 'Energy_Regen':
          displayName = 'Energy Regen';
          break;
        default:
          displayName = type;
      }

      const isPriority = priorityStats.some((priorityStat: string) => {
        const normalizedType = type.replace(/_/g, ' ').toLowerCase();
        const normalizedPriority = priorityStat
          .replace(/_/g, ' ')
          .toLowerCase();
        return (
          normalizedType === normalizedPriority ||
          displayName.toLowerCase() === normalizedPriority
        );
      });

      return {
        name: displayName,
        value: value.toFixed(1),
        isPercent: isPercent,
        rollCount: rollCounts[type] || 0,
        isPriority: isPriority,
      };
    });

    const percentOrder = ['ATK', 'HP', 'DEF', 'CRIT Rate', 'CRIT DMG'];

    return result.sort((a, b) => {
      if (a.isPercent && !b.isPercent) return -1;
      if (!a.isPercent && b.isPercent) return 1;

      if (a.isPercent && b.isPercent) {
        const aIndex = percentOrder.indexOf(a.name);
        const bIndex = percentOrder.indexOf(b.name);

        if (aIndex !== -1 && bIndex !== -1) {
          return aIndex - bIndex;
        }
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return a.name.localeCompare(b.name);
      }

      return a.name.localeCompare(b.name);
    });
  }

  getEquippedDiscsCount(build: AgentBuild): number {
    return Object.keys(build.equippedDiscs).length;
  }

  // Helper to get agent rank display
  getRankDisplay(agentId: string): string {
    const agent = this.referenceAgents.find((a) => a.id === agentId);
    return agent?.rarity === 'S' ? 'S-Rank' : 'A-Rank';
  }

  // Helper to get agent icon
  getAgentIcon(agentId: string): string | undefined {
    const agent = this.referenceAgents.find((a) => a.id === agentId);
    return agent?.icon;
  }

  // Helper to get agent element icon (with special element support)
  getAgentElementIcon(agentId: string): string | undefined {
    const agent = this.referenceAgents.find((a) => a.id === agentId);
    if (!agent) return undefined;

    // Use special element icon if available, otherwise use standard element icon
    if (agent.specialElementIcon) {
      return this.dataMappingService.getElementIconPath(
        agent.specialElementIcon,
      );
    }
    return agent.elementIcon;
  }

  // Helper to get agent rarity
  getAgentRarity(agentId: string): 'A' | 'S' | undefined {
    const agent = this.referenceAgents.find((a) => a.id === agentId);
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
    this.cdr.markForCheck();
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
    const discSet = this.referenceDiscSets.find(
      (ds) => ds.name === equippedDisc.set,
    );
    if (!discSet) return;

    // Set edit mode state
    this.isEditMode = true;
    this.editingDiscUid = equippedDisc.uid;
    this.selectedDiscSlot = slot;
    this.selectedDiscSetForCreation = discSet;

    // Pre-populate form data with existing disc stats
    // Always ensure we have 4 substat slots
    const existingSubStats = equippedDisc.subStats.map((s) => ({
      type: s.type,
      value: s.value as string | number, // Keep as number for display
    }));

    // Pad with empty substats to always have 4 slots
    while (existingSubStats.length < 4) {
      existingSubStats.push({ type: 'ATK%', value: '' });
    }

    this.discFormData = {
      mainStatType: equippedDisc.mainStat.type,
      mainStatValue: equippedDisc.mainStat.value, // Keep as number for display
      subStats: existingSubStats,
    };

    // Open the form directly (skip picker)
    this.showDiscForm = true;
    this.showDiscPicker = false;
    this.cdr.markForCheck();
  }

  closeDiscPicker() {
    this.showDiscPicker = false;
    this.selectedDiscSlot = null;
    this.cdr.markForCheck();
  }

  // OPTIMIZATION: Clear score caches when build changes
  private clearScoreCaches(): void {
    this.discScoreCache.clear();
    this.buildScoreCache.clear();
    this.statCalculator.clearCache();
    this.invalidateBuildCaches();
  }

  // OPTIMIZATION: Invalidate cached template function results
  private invalidateBuildCaches(): void {
    this.cachedSubstatBreakdown = null;
    this.cachedMindscapeBonuses = null;
    this.cachedPassiveBonuses = null;
    this.cachedWEngineRefinementBonuses = null;
    this.lastBuildStateKey = '';
  }

  async unequipDisc(slot: DiscSlot, event: Event) {
    event.stopPropagation();
    if (!this.selectedBuild) return;

    try {
      await this.buildService.unequipDisc(this.selectedBuild.id, slot);
      this.clearScoreCaches(); // OPTIMIZATION: Invalidate caches
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
    const agent = this.referenceAgents.find(
      (a) => a.id === this.selectedBuild!.agentId,
    );
    if (!agent) return [];

    return this.statCalculator.get4pcEffectBonuses(
      this.selectedBuild.equippedDiscs,
      agent,
      this.selectedBuild.equippedWEngine || null,
      this.selectedBuild.mindscapeLevel || 0,
      this.selectedBuild.wEngineRefinement || 1,
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
      filtered = filtered.filter((s) => s.name === this.discFilterSet);
    }

    // Filter by set name search term (debounced)
    if (this.debouncedDiscSearch) {
      const searchLower = this.debouncedDiscSearch.toLowerCase();
      filtered = filtered.filter((s) =>
        s.name.toLowerCase().includes(searchLower),
      );
    }

    // Filter by effect search term (debounced)
    if (this.debouncedDiscEffectSearch) {
      const effectSearchLower = this.debouncedDiscEffectSearch.toLowerCase();
      filtered = filtered.filter((s) => {
        // Search in bonus descriptions (2pc and 4pc effects)
        return s.bonuses.some((bonus) =>
          bonus.description.toLowerCase().includes(effectSearchLower),
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
      filtered = filtered.filter((d) => d.slot === this.selectedDiscSlot);
    }

    // Filter by set
    if (this.discFilterSet) {
      filtered = filtered.filter((d) => d.set === this.discFilterSet);
    }

    // Filter by search term
    if (this.discSearchTerm) {
      const searchLower = this.discSearchTerm.toLowerCase();
      filtered = filtered.filter((d) =>
        d.set.toLowerCase().includes(searchLower),
      );
    }

    // Filter unequipped only
    if (this.showOnlyUnequipped) {
      filtered = filtered.filter((d) => !d.equippedBy);
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
    if (
      !this.selectedBuild ||
      !this.selectedDiscSlot ||
      this.isProcessingDiscAction
    )
      return;

    this.isProcessingDiscAction = true;

    try {
      await this.buildService.equipDisc(this.selectedBuild.id, disc);
      this.clearScoreCaches(); // OPTIMIZATION: Invalidate caches
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
          { type: 'ATK%', value: '' },
        ],
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
        { type: 'ATK%', value: '' },
      ],
    };
    this.cdr.markForCheck();
  }

  async createAndEquipDisc() {
    if (
      !this.selectedBuild ||
      !this.selectedDiscSlot ||
      !this.selectedDiscSetForCreation ||
      this.isProcessingDiscAction
    )
      return;

    this.isProcessingDiscAction = true;

    // For slots 1-3, use fixed values. For slots 4-6, use user input
    let mainStatType: MainStatType;
    let mainStatValue: number;

    if (
      this.selectedDiscSlot === 'Drive1' ||
      this.selectedDiscSlot === 'Drive2' ||
      this.selectedDiscSlot === 'Drive3'
    ) {
      // Fixed main stats for slots 1-3
      mainStatType = this.getDefaultMainStatForSlot(this.selectedDiscSlot);
      mainStatValue = this.getMainStatValueForSlot(this.selectedDiscSlot);
    } else {
      // User input for slots 4-6
      mainStatType = this.discFormData.mainStatType as MainStatType;
      // Convert string to number if needed
      mainStatValue =
        typeof this.discFormData.mainStatValue === 'string'
          ? parseFloat(this.discFormData.mainStatValue) || 0
          : this.discFormData.mainStatValue;
    }

    // Validate substats: Impact and Energy_Regen cannot be disc substats
    const invalidSubstats = this.discFormData.subStats.filter(
      (s) => s.type === 'Impact' || s.type === 'Energy_Regen',
    );
    if (invalidSubstats.length > 0) {
      alert(
        'Error: Impact and Energy_Regen can only be main stats (Drive 6), not substats.',
      );
      this.isProcessingDiscAction = false;
      return;
    }

    try {
      if (this.isEditMode && this.editingDiscUid) {
        // UPDATE MODE: Modify existing disc
        const updates: Partial<Disc> = {
          set: this.selectedDiscSetForCreation.name,
          mainStat: {
            type: mainStatType,
            value: mainStatValue,
          },
          subStats: this.discFormData.subStats.map((s) => {
            const value =
              typeof s.value === 'string' ? parseFloat(s.value) || 0 : s.value;
            return {
              type: s.type as SubStatType,
              value: value,
              rolls: calculateRollCount(s.type, value),
            };
          }),
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
            equippedDiscs: currentDiscs,
          });
        }

        // OPTIMIZATION: Clear caches after updating disc stats
        this.clearScoreCaches();
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
            value: mainStatValue,
          },
          subStats: this.discFormData.subStats.map((s) => {
            const value =
              typeof s.value === 'string' ? parseFloat(s.value) || 0 : s.value;
            return {
              type: s.type as SubStatType,
              value: value,
              rolls: calculateRollCount(s.type, value),
            };
          }),
          lock: false,
        };

        // Add disc to inventory
        await this.discService.addDisc(newDisc);
        // Equip it to the build
        await this.buildService.equipDisc(this.selectedBuild.id, newDisc);

        // OPTIMIZATION: Clear caches after creating new disc
        this.clearScoreCaches();
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
      Drive1: 'HP',
      Drive2: 'ATK',
      Drive3: 'DEF',
      Drive4: 'ATK%',
      Drive5: 'Element_DMG',
      Drive6: 'ATK%',
    };
    return defaults[slot] || 'ATK%';
  }

  getMainStatValueForSlot(slot: DiscSlot): number {
    // Fixed values for slots 1-3 at level 15
    const fixedValues: { [key in DiscSlot]?: number } = {
      Drive1: 2200, // HP
      Drive2: 316, // ATK
      Drive3: 184, // DEF
    };
    return fixedValues[slot] || 0;
  }

  // Disc scoring methods
  getDiscScore(disc: Disc): { score: number; rating: DiscRating } | null {
    if (!this.selectedBuild) return null;

    // Wait for scoring service to load data before calculating
    if (!this.scoringService.areBreakpointsLoaded()) {
      return null;
    }

    // Get active upgrade plan if one is set
    const activePlan = this.selectedBuild.activeUpgradePlanId
      ? this.upgradePlanService.getPlanById(
          this.selectedBuild.activeUpgradePlanId,
        )
      : undefined;

    // Detect build type based on ALL equipped discs (not just this one)
    const allDiscs = Object.values(
      this.selectedBuild.equippedDiscs || {},
    ).filter((d) => d);
    const detectedBuildType =
      allDiscs.length > 0
        ? this.scoringService.detectBuildType(
            allDiscs,
            this.selectedBuild.agentId,
          )
        : undefined;

    // OPTIMIZATION: Cache key for memoization
    const cacheKey = `${disc.uid}-${this.selectedBuild.agentId}-${detectedBuildType || 'default'}-${activePlan?.id || 'none'}`;

    // Check cache first
    if (this.discScoreCache.has(cacheKey)) {
      return this.discScoreCache.get(cacheKey)!;
    }

    const result = this.scoringService.calculateDiscScore(
      disc,
      this.selectedBuild.agentId,
      detectedBuildType, // Use detected build type based on all 6 discs
      activePlan, // Pass upgrade plan to override default weights
    );

    const cachedResult = {
      score: result.score,
      rating: result.rating,
    };

    // Store in cache
    this.discScoreCache.set(cacheKey, cachedResult);

    return cachedResult;
  }

  getDiscRatingClass(rating: DiscRating): string {
    return `rating-${rating.grade.toLowerCase().replace(/\s+/g, '-')}`;
  }

  // Build scoring methods
  getBuildScore(): { score: number; rating: BuildRating } | null {
    if (!this.selectedBuild) return null;

    // Wait for scoring service to load data before calculating
    if (!this.scoringService.areBreakpointsLoaded()) {
      return null;
    }

    // Get equipped discs as array
    const equippedDiscsArray = Object.values(
      this.selectedBuild.equippedDiscs,
    ).filter((d) => d !== undefined);

    // Get agent info for damage estimation
    const agent = this.referenceAgents.find(
      (a) => a.id === this.selectedBuild!.agentId,
    );

    // Get active upgrade plan if one is set
    const activePlan = this.selectedBuild.activeUpgradePlanId
      ? this.upgradePlanService.getPlanById(
          this.selectedBuild.activeUpgradePlanId,
        )
      : undefined;

    // OPTIMIZATION: Cache key based on build state
    const discUids = equippedDiscsArray.map(d => d.uid).sort().join('|');
    const cacheKey = `${this.selectedBuild.id}-${discUids}-${this.selectedBuild.equippedWEngine || 'none'}-${this.selectedBuild.wEngineRefinement || 1}-${this.selectedBuild.mindscapeLevel || 0}-${activePlan?.id || 'none'}`;

    // Check cache first
    if (this.buildScoreCache.has(cacheKey)) {
      return this.buildScoreCache.get(cacheKey)!;
    }

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
      60, // Default level 60, can be updated later
      undefined, // agentScoring - not used here
      undefined, // wengineScoring - not used here
      activePlan, // Pass upgrade plan to override default weights and breakpoints
    );

    const cachedResult = {
      score: result.score,
      rating: result.rating,
    };

    // Store in cache
    this.buildScoreCache.set(cacheKey, cachedResult);

    return cachedResult;
  }

  getBuildRatingClass(rating: BuildRating): string {
    return `rating-${rating.grade.toLowerCase().replace(/\s+/g, '-')}`;
  }

  // Cached feedback to avoid recalculating on every change detection
  private cachedFeedback: FeedbackItem[] | null = null;
  private lastFeedbackBuildHash: string | null = null;

  // Generate a simple hash of build state to detect changes
  private getBuildHash(): string {
    if (!this.selectedBuild) return '';
    const discCount = Object.values(this.selectedBuild.equippedDiscs).filter(
      (d) => d,
    ).length;
    const wEngineId = this.selectedBuild.equippedWEngine?.id || 'none';
    const stats = this.selectedBuild.calculatedStats;

    // Include disc UIDs to detect disc changes (even if stats are same)
    const discUids = Object.values(this.selectedBuild.equippedDiscs)
      .filter((d) => d)
      .map((d) => d.uid)
      .sort()
      .join(',');

    // Include active upgrade plan ID
    const planId = this.selectedBuild.activeUpgradePlanId || 'none';

    // Include detected build type (CRIT vs Anomaly) since feedback differs by build type
    const allDiscs = Object.values(
      this.selectedBuild.equippedDiscs || {},
    ).filter((d) => d);
    const detectedBuildType =
      allDiscs.length > 0
        ? this.scoringService.detectBuildType(
            allDiscs,
            this.selectedBuild.agentId,
          )
        : 'unknown';

    return `${this.selectedBuild.id}-${discCount}-${wEngineId}-${stats.atk}-${stats.critRate}-${stats.critDmg}-${discUids}-${planId}-${detectedBuildType}`;
  }

  getBuildFeedback(): FeedbackItem[] {
    if (!this.selectedBuild) return [];

    // Wait for scoring service to load data
    if (!this.scoringService.areBreakpointsLoaded()) {
      return [];
    }

    // Return cached result if build state hasn't changed
    const currentHash = this.getBuildHash();
    if (this.cachedFeedback && this.lastFeedbackBuildHash === currentHash) {
      return this.cachedFeedback;
    }

    // Get active upgrade plan if one is set
    const activePlan = this.selectedBuild.activeUpgradePlanId
      ? this.upgradePlanService.getPlanById(
          this.selectedBuild.activeUpgradePlanId,
        )
      : undefined;

    this.cachedFeedback = this.scoringService.generateBuildFeedback(
      this.selectedBuild.agentId,
      this.selectedBuild.calculatedStats,
      this.selectedBuild.equippedDiscs,
      !!this.selectedBuild.equippedWEngine,
      this.isWEngineSpecialtyMatch(),
      activePlan,
    );
    this.lastFeedbackBuildHash = currentHash;

    return this.cachedFeedback;
  }

  // Clear feedback cache when build changes
  clearFeedbackCache(): void {
    this.cachedFeedback = null;
    this.lastFeedbackBuildHash = null;
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

  // Check if a substat type is a priority stat for the selected build's agent
  // Now uses build-aware weights that adapt based on detected build type (CRIT vs Anomaly)
  isPrioritySubstat(substatType: SubStatType): boolean {
    if (!this.selectedBuild || !this.scoringService.areBreakpointsLoaded()) {
      return false;
    }

    // Get all equipped discs for build detection
    const equippedDiscs: Disc[] = [];
    if (this.selectedBuild.equippedDiscs) {
      Object.values(this.selectedBuild.equippedDiscs).forEach((disc) => {
        if (disc) equippedDiscs.push(disc);
      });
    }

    // Detect build type (CRIT, Anomaly, or Support) based on equipped discs
    const detectedBuildType =
      equippedDiscs.length > 0
        ? this.scoringService.detectBuildType(
            equippedDiscs,
            this.selectedBuild.agentId,
          )
        : 'CRIT';

    // Get build-aware stat weights
    const buildWeights = this.scoringService.getBuildStatWeights(
      this.selectedBuild.agentId,
      detectedBuildType,
    );

    // Check if this substat is valued in the detected build (weight >= 1.0)
    if (Object.keys(buildWeights).length > 0) {
      return (buildWeights[substatType] || 0) >= 1.0;
    }

    // Fallback to priorityStats array if no stat weights available (legacy agents)
    const breakpoints = this.scoringService.getAgentBreakpoints(
      this.selectedBuild.agentId,
    );
    if (
      breakpoints?.priorityStats &&
      Array.isArray(breakpoints.priorityStats)
    ) {
      return breakpoints.priorityStats.includes(substatType);
    }

    return false;
  }

  // Auto-fill main stat value when user selects a main stat type for slots 4-6
  onMainStatTypeChange(): void {
    // Clear value first
    this.discFormData.mainStatValue = 0;

    // Exit if no slot or no main stat selected
    if (!this.selectedDiscSlot || !this.discFormData.mainStatType) {
      return;
    }

    // Only auto-fill for slots 4-6
    if (
      this.selectedDiscSlot === 'Drive4' ||
      this.selectedDiscSlot === 'Drive5' ||
      this.selectedDiscSlot === 'Drive6'
    ) {
      const maxValues = DISC_MAIN_STAT_MAX[this.selectedDiscSlot];
      if (
        maxValues &&
        maxValues[this.discFormData.mainStatType] !== undefined
      ) {
        this.discFormData.mainStatValue =
          maxValues[this.discFormData.mainStatType];
      }
    }
  }

  // Get available main stat options for the current disc slot
  getMainStatOptionsForSlot(): string[] {
    if (!this.selectedDiscSlot) return [];
    return MAIN_STAT_BY_SLOT[this.selectedDiscSlot] || [];
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
      .map((agent) => agent.icon)
      .filter((icon) => icon) as string[];

    this.imagePreloader.preloadImages(imageUrls);
  }

  private preloadWEngineImages(wEngines: WEngine[]): void {
    if (!wEngines || wEngines.length === 0) {
      return; // Don't preload if no W-Engines yet
    }

    // Preload static W-Engine icons
    const staticImageUrls = wEngines
      .map((engine) => engine.icon)
      .filter((icon) => icon) as string[];

    // Preload animated W-Engine versions (desktop only)
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 769;
    let animatedImageUrls: string[] = [];

    if (isDesktop) {
      animatedImageUrls = wEngines
        .filter((engine) => engine.name)
        .map((engine) => {
          // Convert name to animated filename format
          // Remove apostrophes: "Grill O'Wisp" -> "Grill_OWisp", "Kraken's Cradle" -> "Krakens_Cradle"
          const animatedName = engine.name
            .replace(/\[/g, '(')
            .replace(/\]/g, ')')
            .replace(/'/g, '')  // Remove all apostrophes
            .replace(/\s+/g, '_') + '_Animation.webp';
          return `assets/data/images/wengine-gifs/${animatedName}`;
        });
    }

    // Combine both static and animated URLs
    const allImageUrls = [...staticImageUrls, ...animatedImageUrls];

    this.imagePreloader.preloadImages(allImageUrls);
  }

  private preloadDiscSetImages(discSets: DiscSet[]): void {
    if (!discSets || discSets.length === 0) {
      return; // Don't preload if no disc sets yet
    }

    const imageUrls = discSets
      .map((discSet) => discSet.icon)
      .filter((icon) => icon) as string[];

    this.imagePreloader.preloadImages(imageUrls);
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
  showConfirmation(
    title: string,
    message: string,
    onConfirm: () => void,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
  ) {
    this.confirmDialogData = {
      title,
      message,
      confirmText,
      cancelText,
      onConfirm,
    };
    this.showConfirmDialog = true;
    this.cdr.markForCheck();
  }

  confirmAction() {
    this.confirmDialogData.onConfirm();
    this.closeConfirmDialog();
  }

  closeConfirmDialog() {
    this.showConfirmDialog = false;
    this.cdr.markForCheck();
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

  trackByFeedbackIndex(index: number, _item: FeedbackItem): number {
    return index;
  }

  // =====================================
  // Share Build as Image
  // =====================================

  async shareAsImage() {
    if (!this.selectedBuild) return;
    this.showShareModal = true;
    this.cdr.markForCheck();

    // Wait for modal and canvas to be rendered
    setTimeout(() => this.generateShareImage(), 100);
  }

  closeShareModal() {
    this.showShareModal = false;
    this.cdr.markForCheck();
  }

  isGeneratingShareImage = false;

async generateShareImage() {
  if (!this.selectedBuild || !this.shareCanvasRef)
    return;

  this.isGeneratingShareImage = true;
  this.cdr.markForCheck(); // Force change detection

  try {
    // Get agent data
    const agent = this.referenceAgents.find(
      (a) => a.id === this.selectedBuild!.agentId,
    );
    if (!agent) {
      console.error('Agent not found');
      alert('Error: Agent data not found');
      return;
    }

    // Collect disc scores
    const discScores = new Map<string, { score: number; rating: any }>();
    Object.values(this.selectedBuild.equippedDiscs).forEach((disc) => {
      if (disc) {
        const score = this.getDiscScore(disc);
        if (score) {
          discScores.set(disc.uid, score);
        }
      }
    });

    // Prepare data for Canvas renderer
    const shareData: ShareImageData = {
      build: this.selectedBuild,
      agent: agent,
      buildScore: this.getBuildScore(),
      discScores: discScores,
      mainStats: this.getMainStats(),
      wEngineStats: this.getWEngineStats(),
      discSets: this.referenceDiscSets,
      substatBreakdown: this.getSubstatBreakdown(),
    };

    // Generate image using Canvas service
    const blob = await this.canvasShareImageService.generateShareImage(shareData);

    // Display the image on canvas
    const displayCanvas = this.shareCanvasRef.nativeElement;
    const img = new Image();
    img.onload = () => {
      displayCanvas.width = img.width;
      displayCanvas.height = img.height;
      const ctx = displayCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
      }
      URL.revokeObjectURL(img.src);
      this.isGeneratingShareImage = false;
      this.cdr.markForCheck();
    };
    img.onerror = (err) => {
      console.error('Failed to load generated image:', err);
      alert('Error loading generated image');
      this.isGeneratingShareImage = false;
      this.cdr.markForCheck();
    };
    img.src = URL.createObjectURL(blob);

  } catch (error) {
    console.error('Error generating share image:', error);
    alert('Error generating share image. Check console for details.');
    this.isGeneratingShareImage = false;
    this.cdr.markForCheck();
  }
}


  downloadShareImage() {
    if (!this.selectedBuild || !this.shareCanvasRef) return;

    const canvas = this.shareCanvasRef.nativeElement;
    const agent = this.referenceAgents.find(
      (a) => a.id === this.selectedBuild!.agentId,
    );

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-') // remove illegal filename chars
      .replace('T', '_')
      .slice(0, 19); // YYYY-MM-DD_HH-mm-ss

    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `${agent?.name || 'build'}-${this.selectedBuild!.name}-${timestamp}.png`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
      }
    });
  }

  // =====================================
  // Enka Network UID Import
  // =====================================

  loadUidHistory() {
    try {
      const stored = localStorage.getItem(this.UID_HISTORY_KEY);
      if (stored) {
        this.uidHistory = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load UID history:', error);
      this.uidHistory = [];
    }
  }

  saveUidHistory() {
    try {
      localStorage.setItem(
        this.UID_HISTORY_KEY,
        JSON.stringify(this.uidHistory),
      );
    } catch (error) {
      console.error('Failed to save UID history:', error);
    }
  }

  addToUidHistory(uid: string, username: string) {
    const trimmedUid = uid.trim();
    if (!trimmedUid) return;

    // Remove if already exists (to move to front)
    this.uidHistory = this.uidHistory.filter((u) => u.uid !== trimmedUid);

    // Add to front
    this.uidHistory.unshift({ uid: trimmedUid, username });

    // Keep only last MAX_UID_HISTORY items
    if (this.uidHistory.length > this.MAX_UID_HISTORY) {
      this.uidHistory = this.uidHistory.slice(0, this.MAX_UID_HISTORY);
    }

    this.saveUidHistory();
  }

  async selectUidFromHistory(historyItem: { uid: string; username: string }) {
    this.showUidHistoryDropdown = false;

    // Use global loading overlay for better UX
    this.loadingService.show(`Fetching data for ${historyItem.username}...`);

    try {
      // Fetch data from Enka API
      const enkaResult = await this.enkaApiService
        .fetchPlayerData(historyItem.uid)
        .toPromise();

      if (!enkaResult) {
        throw new Error('No data received from provided UID');
      }

      // Compare with existing builds
      const comparison = await this.enkaImportService.compareBuilds(
        enkaResult.builds,
      );

      this.loadingService.hide();

      // Show confirmation dialog if there are changes
      if (
        comparison.newBuilds.length > 0 ||
        comparison.updatedBuilds.length > 0
      ) {
        const summary =
          this.enkaImportService.generateImportSummary(comparison);

        this.showConfirmation(
          'Import from UID',
          `Found player: ${enkaResult.playerName}

          ${summary}

          Do you want to import these builds?`,
          async () => {
            try {
              this.loadingService.show('Importing builds...');
              const result = await this.enkaImportService.importBuilds(
                comparison,
                true,
              );

              // Reload builds to show the imported data
              await this.buildService.loadBuilds();
              this.loadingService.hide();
            } catch (error) {
              this.loadingService.hide();
              console.error('Import error:', error);
              alert(
                error instanceof Error
                  ? error.message
                  : 'Failed to import builds'
              );
            }
          },
          'Import',
          'Cancel',
        );
      } else {
        alert('All builds are already up to date!');
      }
    } catch (error) {
      this.loadingService.hide();
      console.error('Enka API error:', error);
      alert(
        error instanceof Error
          ? error.message
          : 'Failed to fetch data from provided UID'
      );
    }
  }

  toggleUidHistoryDropdown() {
    this.showUidHistoryDropdown = !this.showUidHistoryDropdown;
    this.cdr.markForCheck();
  }

  clearUidHistory() {
    this.uidHistory = [];
    this.saveUidHistory();
    this.showUidHistoryDropdown = false;
    this.cdr.markForCheck();
  }

  openEnkaImportModal() {
    this.showEnkaImportModal = true;
    this.enkaImportError = '';
    this.enkaImportSuccess = '';
    this.enkaUid = '';
    this.showUidHistoryDropdown = false;
    this.cdr.markForCheck();
  }

  closeEnkaImportModal() {
    this.showEnkaImportModal = false;
    this.enkaUid = '';
    this.enkaImportError = '';
    this.enkaImportSuccess = '';
    this.showUidHistoryDropdown = false;
    this.cdr.markForCheck();
  }

  async importFromEnka() {
    if (!this.enkaUid.trim()) {
      this.enkaImportError = 'Please enter a valid UID';
      this.cdr.markForCheck();
      return;
    }

    this.isImportingFromEnka = true;
    this.enkaImportError = '';
    this.enkaImportSuccess = '';
    this.cdr.markForCheck();

    try {
      // Fetch data from Enka API
      const enkaResult = await this.enkaApiService
        .fetchPlayerData(this.enkaUid)
        .toPromise();

      if (!enkaResult) {
        throw new Error('No data received from provided UID');
      }

      // Add UID to history on successful fetch
      this.addToUidHistory(this.enkaUid, enkaResult.playerName);

      // Compare with existing builds
      const comparison = await this.enkaImportService.compareBuilds(
        enkaResult.builds,
      );

      // Show confirmation dialog if there are changes
      if (
        comparison.newBuilds.length > 0 ||
        comparison.updatedBuilds.length > 0
      ) {
        const summary =
          this.enkaImportService.generateImportSummary(comparison);

        // Close the Enka import modal before showing confirmation dialog
        this.closeEnkaImportModal();

        this.showConfirmation(
          'Import from UID',
          `Found player: ${enkaResult.playerName}

          ${summary}

          Do you want to import these builds?`,
          async () => {
            try {
              const result = await this.enkaImportService.importBuilds(
                comparison,
                true,
              );

              // Reload builds to show the imported data
              await this.buildService.loadBuilds();

            } catch (error) {
              console.error('Import error:', error);
              // Re-open the Enka modal to show error
              this.enkaImportError =
                error instanceof Error
                  ? error.message
                  : 'Failed to import builds';
              this.openEnkaImportModal();
            }
          },
          'Import',
          'Cancel',
        );
      } else {
        this.enkaImportSuccess = 'All builds are already up to date!';
        this.cdr.markForCheck();

        // Close modal after 2 seconds
        setTimeout(() => {
          this.closeEnkaImportModal();
        }, 2000);
      }
    } catch (error) {
      console.error('Enka API error:', error);
      this.enkaImportError =
        error instanceof Error
          ? error.message
          : 'Failed to fetch data from provided UID';
      this.cdr.markForCheck();
    } finally {
      this.isImportingFromEnka = false;
      this.cdr.markForCheck();
    }
  }

  // ============================================================================
  // UPGRADE PLAN METHODS
  // ============================================================================

  /**
   * Get all upgrade plans for the selected build's agent
   */
  getPlansForSelectedAgent(): UpgradePlan[] {
    if (!this.selectedBuild) {
      return [];
    }

    // Filter from locally stored plans for proper change detection
    return this.availablePlans.filter(
      (plan) => plan.agentId === this.selectedBuild!.agentId,
    );
  }

  /**
   * Handle upgrade plan change
   * Recalculates disc scores and build score with new plan's priorities/breakpoints
   */
  async onUpgradePlanChange(): Promise<void> {
    if (!this.selectedBuild) {
      return;
    }

    try {
      // Update the build with the new active plan ID
      // This will trigger a recalculation in the build service
      await this.buildService.updateBuild(this.selectedBuild.id, {
        activeUpgradePlanId: this.selectedBuild.activeUpgradePlanId,
      });

      this.clearScoreCaches(); // OPTIMIZATION: Invalidate caches when upgrade plan changes
    } catch (error) {
      console.error('Error updating build with upgrade plan:', error);
    }
  }

  // ============================================================================
  // SHARE IMAGE HELPER METHODS
  // ============================================================================

  getMainStats(): Array<{ iconName: string; label: string; value: string }> {
    if (!this.selectedBuild) return [];

    const stats = this.selectedBuild.calculatedStats;
    return [
      { iconName: 'HP', label: 'HP', value: String(stats.hp) },
      { iconName: 'ATK', label: 'ATK', value: String(stats.atk) },
      { iconName: 'DEF', label: 'DEF', value: String(stats.def) },
      { iconName: 'CRIT_Rate', label: 'CRIT', value: `${stats.critRate}%` },
      { iconName: 'CRIT_DMG', label: 'CD', value: `${stats.critDmg}%` },
      { iconName: 'Impact', label: 'Impact', value: String(stats.impact) },
      {
        iconName: 'Anomaly_Mastery',
        label: 'AM',
        value: String(stats.anomalyMastery),
      },
      {
        iconName: 'Anomaly_Proficiency',
        label: 'AP',
        value: String(stats.anomalyProficiency),
      },
      { iconName: 'PEN_Ratio', label: 'PEN%', value: `${stats.penRatio}%` },
      { iconName: 'Energy_Regen', label: 'ER', value: `${stats.energyRegen}%` },
    ];
  }

  getWEngineStats(): Array<{ iconName: string; label: string; value: string }> {
    if (!this.selectedBuild?.equippedWEngine) return [];

    const wEngine = this.selectedBuild.equippedWEngine;
    const stats: Array<{ iconName: string; label: string; value: string }> = [];

    // Add base ATK
    stats.push({
      iconName: 'ATK',
      label: 'Base ATK',
      value: String(wEngine.baseAtk),
    });

    // Add substat
    if (wEngine.subStat) {
      const statTypeMap: Record<string, string> = {
        'ATK%': 'ATK',
        'HP%': 'HP',
        'DEF%': 'DEF',
        CRIT_Rate: 'CRIT_Rate',
        CRIT_DMG: 'CRIT_DMG',
        PEN_Ratio: 'PEN_Ratio',
        Energy_Regen: 'Energy_Regen',
        Impact: 'Impact',
        Anomaly_Proficiency: 'Anomaly_Proficiency',
      };

      const iconName =
        statTypeMap[wEngine.subStat.type] || wEngine.subStat.type;
      const isPercent =
        wEngine.subStat.type.includes('%') ||
        wEngine.subStat.type === 'CRIT_Rate' ||
        wEngine.subStat.type === 'CRIT_DMG' ||
        wEngine.subStat.type === 'PEN_Ratio' ||
        wEngine.subStat.type === 'Energy_Regen';

      stats.push({
        iconName: iconName,
        label: wEngine.subStat.type.replace(/_/g, ' '),
        value: isPercent
          ? `${wEngine.subStat.value}%`
          : String(wEngine.subStat.value),
      });
    }

    return stats;
  }

  // Format W-Engine substat value with % only for percentage stats
  formatWEngineSubstatValue(subStat: { type: string; value: number }): string {
    const isPercent =
      subStat.type.includes('%') ||
      subStat.type === 'CRIT_Rate' ||
      subStat.type === 'CRIT_DMG' ||
      subStat.type === 'PEN_Ratio' ||
      subStat.type === 'Energy_Regen';

    return isPercent ? `${subStat.value}%` : String(subStat.value);
  }

  getDiscSetByName(name: string): DiscSet | undefined {
    return this.discSetService.getDiscSetByName(name);
  }

  getWEngineIconPath(wengine: any): string {
    // Check if desktop (window width >= 769px)
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 769;

    if (isDesktop && wengine.name) {
      // Try animated version first
      // Convert name: "[Identity] Base" -> "(Identity)_Base_Animation.webp"
      // Remove apostrophes: "Grill O'Wisp" -> "Grill_OWisp", "Kraken's Cradle" -> "Krakens_Cradle"
      const animatedName = wengine.name
        .replace(/\[/g, '(')
        .replace(/\]/g, ')')
        .replace(/'/g, '')  // Remove all apostrophes
        .replace(/\s+/g, '_') + '_Animation.webp';

      return `assets/data/images/wengine-gifs/${animatedName}`;
    }

    // Fallback to static icon
    return wengine.icon || '';
  }

  isWEngineAnimated(wengine: any): boolean {
    return typeof window !== 'undefined' && window.innerWidth >= 769 && !!wengine?.name;
  }

  onWEngineImageError(event: any, wengine: any): void {
    // If animated image fails to load, fall back to static
    event.target.src = wengine.icon;
    event.target.classList.remove('animated');
  }
}
