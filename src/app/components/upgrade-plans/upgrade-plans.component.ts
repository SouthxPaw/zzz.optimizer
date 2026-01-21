import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { UpgradePlanService } from '../../services/upgrade-plan.service';
import { AgentService } from '../../services/agent.service';
import { DiscSetService } from '../../services/disc-set.service';
import { NotificationService } from '../../services/notification.service';
import { UpgradePlan } from '../../models/upgrade-plan.model';
import { Agent } from '../../models/agent.model';
import { DiscSet } from '../../services/disc-set.service';
import { MAIN_STAT_BY_SLOT } from '../../constants/main-stat-possibilities';

@Component({
  selector: 'app-upgrade-plans',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './upgrade-plans.component.html',
  styleUrls: ['./upgrade-plans.component.css'],
})
export class UpgradePlansComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // Expose Object for template use
  Object = Object;

  // Data
  plans: UpgradePlan[] = [];
  selectedPlan: UpgradePlan | null = null;
  referenceAgents: Agent[] = [];
  referenceDiscSets: DiscSet[] = [];

  // UI state
  showDeleteConfirm = false;
  planToDelete: UpgradePlan | null = null;
  showDuplicateConfirm = false;
  planToDuplicate: UpgradePlan | null = null;

  // Form data for creating new plan
  newPlanName = '';
  newPlanAgentId = '';
  newPlanDescription = '';

  // Available options
  discSlots = ['Drive1', 'Drive2', 'Drive3', 'Drive4', 'Drive5', 'Drive6'];
  priorityLevels = ['Essential', 'Important', 'Nice', 'Ignore'];

  // Main stat options per slot (imported from constants to ensure accuracy)
  drive4MainStats = MAIN_STAT_BY_SLOT.Drive4;
  drive5MainStats = MAIN_STAT_BY_SLOT.Drive5;
  drive6MainStats = MAIN_STAT_BY_SLOT.Drive6;

  // All possible substats
  allSubstats = [
    'HP%', 'ATK%', 'DEF%', 'HP', 'ATK', 'DEF',
    'CRIT_Rate', 'CRIT_DMG', 'Anomaly_Proficiency', 'PEN'
  ];

  // Breakpoint stat keys
  breakpointStats = [
    { key: 'hp', label: 'HP', isPercentage: false },
    { key: 'atk', label: 'ATK', isPercentage: false },
    { key: 'def', label: 'DEF', isPercentage: false },
    { key: 'impact', label: 'Impact', isPercentage: false },
    { key: 'anomalyMastery', label: 'Anomaly Mastery', isPercentage: false },
    { key: 'critRate', label: 'CRIT Rate', isPercentage: true },
    { key: 'critDmg', label: 'CRIT DMG', isPercentage: true },
    { key: 'anomalyProficiency', label: 'Anomaly Proficiency', isPercentage: false },
    { key: 'pen', label: 'PEN (Flat)', isPercentage: false },
    { key: 'penRatio', label: 'PEN Ratio', isPercentage: true },
    { key: 'energyRegen', label: 'Energy Regen', isPercentage: true }
  ];

  constructor(
    private upgradePlanService: UpgradePlanService,
    private agentService: AgentService,
    private discSetService: DiscSetService,
    private notificationService: NotificationService
  ) {}

  ngOnInit() {
    // Load plans
    this.upgradePlanService.plans$
      .pipe(takeUntil(this.destroy$))
      .subscribe(plans => {
        this.plans = plans;
      });

    // Load reference data
    this.agentService.agents$
      .pipe(takeUntil(this.destroy$))
      .subscribe(agents => {
        // Sort agents alphabetically by name
        this.referenceAgents = agents.sort((a, b) => a.name.localeCompare(b.name));
      });

    this.discSetService.discSets$
      .pipe(takeUntil(this.destroy$))
      .subscribe(sets => {
        this.referenceDiscSets = sets;
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ============================================================================
  // PLAN CRUD OPERATIONS
  // ============================================================================

  createNewPlan() {
    if (!this.newPlanName.trim() || !this.newPlanAgentId) {
      this.notificationService.warning('Please enter a plan name and select an agent', 3000);
      return;
    }

    const plan = this.upgradePlanService.createPlan(
      this.newPlanAgentId,
      this.newPlanName.trim(),
      this.newPlanDescription.trim()
    );

    // Select the newly created plan
    this.selectedPlan = plan;
    this.upgradePlanService.selectPlan(plan);

    // Show success notification
    this.notificationService.success('Upgrade plan created successfully!', 3000);

    // Reset form
    this.newPlanName = '';
    this.newPlanAgentId = '';
    this.newPlanDescription = '';
  }

  selectPlan(plan: UpgradePlan) {
    this.selectedPlan = plan;
    this.upgradePlanService.selectPlan(plan);
  }

  savePlan() {
    if (!this.selectedPlan) return;

    try {
      this.upgradePlanService.updatePlan(this.selectedPlan.id, this.selectedPlan);
      this.notificationService.success('Plan saved successfully!', 3000);
    } catch (error) {
      console.error('Error saving plan:', error);
      this.notificationService.error('Failed to save plan', 4000);
    }
  }

  confirmDeletePlan(plan: UpgradePlan) {
    this.planToDelete = plan;
    this.showDeleteConfirm = true;
  }

  deletePlan() {
    if (!this.planToDelete) return;

    this.upgradePlanService.deletePlan(this.planToDelete.id);

    if (this.selectedPlan?.id === this.planToDelete.id) {
      this.selectedPlan = null;
    }

    this.showDeleteConfirm = false;
    this.planToDelete = null;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.planToDelete = null;
  }

  confirmDuplicatePlan(plan: UpgradePlan) {
    this.planToDuplicate = plan;
    this.showDuplicateConfirm = true;
  }

  duplicatePlan() {
    if (!this.planToDuplicate) return;

    const duplicated = this.upgradePlanService.duplicatePlan(this.planToDuplicate.id);
    if (duplicated) {
      this.selectPlan(duplicated);
      this.notificationService.success('Plan duplicated successfully!', 3000);
    }

    this.showDuplicateConfirm = false;
    this.planToDuplicate = null;
  }

  cancelDuplicate() {
    this.showDuplicateConfirm = false;
    this.planToDuplicate = null;
  }

  // ============================================================================
  // MAIN STAT PREFERENCES
  // ============================================================================

  getMainStatPreference(slot: string, stat: string): 'Acceptable' | 'Not Acceptable' {
    if (!this.selectedPlan) return 'Acceptable';
    const validSlot = slot as 'Drive4' | 'Drive5' | 'Drive6';
    return this.selectedPlan.mainStatPreferences[validSlot]?.[stat] || 'Acceptable';
  }

  toggleMainStatPreference(slot: string, stat: string) {
    if (!this.selectedPlan) return;

    const validSlot = slot as 'Drive4' | 'Drive5' | 'Drive6';
    if (!this.selectedPlan.mainStatPreferences[validSlot]) {
      this.selectedPlan.mainStatPreferences[validSlot] = {};
    }

    const current = this.selectedPlan.mainStatPreferences[validSlot][stat] || 'Acceptable';
    this.selectedPlan.mainStatPreferences[validSlot][stat] =
      current === 'Acceptable' ? 'Not Acceptable' : 'Acceptable';
  }

  // ============================================================================
  // SUBSTAT PRIORITIES
  // ============================================================================

  getSubstatPriority(slot: string, stat: string): string {
    if (!this.selectedPlan) return 'Ignore';
    return this.selectedPlan.substatPriorities[slot]?.[stat] || 'Ignore';
  }

  setSubstatPriority(slot: string, stat: string, priority: string) {
    if (!this.selectedPlan) return;

    if (!this.selectedPlan.substatPriorities[slot]) {
      this.selectedPlan.substatPriorities[slot] = {};
    }

    this.selectedPlan.substatPriorities[slot][stat] = priority as any;
  }

  // ============================================================================
  // CUSTOM BREAKPOINTS
  // ============================================================================

  getBreakpoint(statKey: string, field: 'min' | 'optimal'): number {
    if (!this.selectedPlan) return 0;
    return this.selectedPlan.customBreakpoints[statKey]?.[field] || 0;
  }

  setBreakpoint(statKey: string, field: 'min' | 'optimal', value: string) {
    if (!this.selectedPlan) return;

    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;

    if (!this.selectedPlan.customBreakpoints[statKey]) {
      this.selectedPlan.customBreakpoints[statKey] = { min: 0, optimal: 0 };
    }

    this.selectedPlan.customBreakpoints[statKey][field] = numValue;
  }

  resetBreakpoint(statKey: string) {
    // This would reset to the agent's default breakpoints
    // For now, just set to 0
    if (!this.selectedPlan) return;

    this.selectedPlan.customBreakpoints[statKey] = { min: 0, optimal: 0 };
  }

  // ============================================================================
  // DISC SET PREFERENCES
  // ============================================================================

  toggleDiscSetType(type: '4pc+2pc' | '2pc+2pc+2pc') {
    if (!this.selectedPlan) return;
    this.selectedPlan.setPreferences.type = type;
  }

  togglePreferredSet(setName: string) {
    if (!this.selectedPlan) return;

    const index = this.selectedPlan.setPreferences.preferredSets.indexOf(setName);
    if (index > -1) {
      this.selectedPlan.setPreferences.preferredSets.splice(index, 1);
    } else {
      this.selectedPlan.setPreferences.preferredSets.push(setName);
    }
  }

  isSetPreferred(setName: string): boolean {
    if (!this.selectedPlan) return false;
    return this.selectedPlan.setPreferences.preferredSets.includes(setName);
  }

  // ============================================================================
  // EXPORT/IMPORT
  // ============================================================================

  exportPlans() {
    const json = this.upgradePlanService.exportPlans();
    const blob = new Blob([json], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `upgrade-plans-${Date.now()}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  importPlans(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const json = e.target?.result as string;
        const count = this.upgradePlanService.importPlans(json);
        this.notificationService.success(`Successfully imported ${count} upgrade plan(s)!`, 4000);

        // Reset input
        input.value = '';
      } catch (error) {
        console.error('Import error:', error);
        this.notificationService.error('Failed to import plans. Please check the file format.', 4000);
        input.value = '';
      }
    };

    reader.readAsText(file);
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  getAgentName(agentId: string): string {
    const agent = this.referenceAgents.find(a => a.id === agentId);
    return agent?.name || 'Unknown';
  }

  getPlansByAgent(): { [agentId: string]: UpgradePlan[] } {
    const grouped: { [agentId: string]: UpgradePlan[] } = {};

    this.plans.forEach(plan => {
      if (!grouped[plan.agentId]) {
        grouped[plan.agentId] = [];
      }
      grouped[plan.agentId].push(plan);
    });

    return grouped;
  }

  getMainStatsForSlot(slot: string): string[] {
    switch (slot) {
      case 'Drive4': return this.drive4MainStats;
      case 'Drive5': return this.drive5MainStats;
      case 'Drive6': return this.drive6MainStats;
      default: return [];
    }
  }

  formatStatName(stat: string): string {
    // Format stat names for display
    return stat.replace(/_/g, ' ');
  }
}
