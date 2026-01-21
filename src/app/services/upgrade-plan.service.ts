import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';
import { UpgradePlan } from '../models/upgrade-plan.model';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { versionedUrl } from '../utils/versioned-url';

@Injectable({
  providedIn: 'root'
})
export class UpgradePlanService {
  private plansSubject = new BehaviorSubject<UpgradePlan[]>([]);
  public plans$: Observable<UpgradePlan[]> = this.plansSubject.asObservable();

  private selectedPlanSubject = new BehaviorSubject<UpgradePlan | null>(null);
  public selectedPlan$: Observable<UpgradePlan | null> = this.selectedPlanSubject.asObservable();

  private agentBreakpoints: any = {};

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private http: HttpClient
  ) {
    this.loadPlans();
    this.loadAgentBreakpoints();
  }

  /**
   * Load agent breakpoints to use as defaults when creating new plans
   */
  private async loadAgentBreakpoints() {
    try {
      const data = await firstValueFrom(
        this.http.get<any>(versionedUrl('assets/data/agent-breakpoints.json'))
      );
      this.agentBreakpoints = data.agents || {};
      console.log('Loaded agent breakpoints for upgrade plans');
    } catch (error) {
      console.error('Failed to load agent breakpoints:', error);
    }
  }

  /**
   * Load all upgrade plans from localStorage
   */
  private loadPlans() {
    // Only run in browser
    if (!isPlatformBrowser(this.platformId)) {
      this.plansSubject.next([]);
      return;
    }

    try {
      const plansJson = localStorage.getItem('zzz-optimizer-upgrade-plans');
      if (plansJson) {
        const plans: UpgradePlan[] = JSON.parse(plansJson);
        this.plansSubject.next(plans);
        console.log(`Loaded ${plans.length} upgrade plans`);
      } else {
        this.plansSubject.next([]);
      }
    } catch (error) {
      console.error('Error loading upgrade plans:', error);
      this.plansSubject.next([]);
    }
  }

  /**
   * Save plans to localStorage
   */
  private savePlans(plans: UpgradePlan[]) {
    // Only run in browser
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    try {
      localStorage.setItem('zzz-optimizer-upgrade-plans', JSON.stringify(plans));
      this.plansSubject.next(plans);
    } catch (error) {
      console.error('Error saving upgrade plans:', error);
      throw error;
    }
  }

  /**
   * Get all plans
   */
  getPlans(): UpgradePlan[] {
    return this.plansSubject.value;
  }

  /**
   * Get plan by ID
   */
  getPlanById(id: string): UpgradePlan | undefined {
    return this.plansSubject.value.find(p => p.id === id);
  }

  /**
   * Get all plans for a specific agent
   */
  getPlansByAgentId(agentId: string): UpgradePlan[] {
    return this.plansSubject.value.filter(p => p.agentId === agentId);
  }

  /**
   * Create a new upgrade plan
   * Only copies default breakpoints from agent-breakpoints.json
   * NO other pre-filling - user has complete freedom
   */
  createPlan(agentId: string, name: string, description?: string): UpgradePlan {
    const plans = this.plansSubject.value;

    // Copy default breakpoints from agent-breakpoints.json if available
    const agentBreakpoints = this.agentBreakpoints[agentId];
    const customBreakpoints: { [stat: string]: { min: number; optimal: number } } = {};

    if (agentBreakpoints && agentBreakpoints.breakpoints) {
      // Copy all breakpoints from agent-breakpoints.json
      Object.keys(agentBreakpoints.breakpoints).forEach(statKey => {
        customBreakpoints[statKey] = {
          min: agentBreakpoints.breakpoints[statKey].min,
          optimal: agentBreakpoints.breakpoints[statKey].optimal
        };
      });
    } else {
      // No agent breakpoints available, initialize with zeros
      const defaultStats = ['hp', 'atk', 'def', 'impact', 'anomalyMastery', 'critRate', 'critDmg', 'anomalyProficiency', 'pen', 'penRatio', 'energyRegen'];
      defaultStats.forEach(stat => {
        customBreakpoints[stat] = { min: 0, optimal: 0 };
      });
    }

    const newPlan: UpgradePlan = {
      id: this.generateId(),
      name,
      agentId,
      description: description || '',
      setPreferences: {
        type: '4pc+2pc',
        preferredSets: []
      },
      mainStatPreferences: {
        Drive4: {},
        Drive5: {},
        Drive6: {}
      },
      substatPriorities: {
        Drive1: {},
        Drive2: {},
        Drive3: {},
        Drive4: {},
        Drive5: {},
        Drive6: {}
      },
      customBreakpoints,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    plans.push(newPlan);
    this.savePlans(plans);

    return newPlan;
  }

  /**
   * Update an upgrade plan
   */
  updatePlan(id: string, updates: Partial<UpgradePlan>): void {
    const plans = this.plansSubject.value;
    const index = plans.findIndex(p => p.id === id);

    if (index === -1) {
      throw new Error(`Upgrade plan ${id} not found`);
    }

    plans[index] = {
      ...plans[index],
      ...updates,
      updatedAt: new Date()
    };

    this.savePlans(plans);

    // Update selected plan if it's the one being updated
    if (this.selectedPlanSubject.value?.id === id) {
      this.selectedPlanSubject.next(plans[index]);
    }
  }

  /**
   * Delete an upgrade plan
   */
  deletePlan(id: string): void {
    const plans = this.plansSubject.value.filter(p => p.id !== id);
    this.savePlans(plans);

    // Clear selection if deleted plan was selected
    if (this.selectedPlanSubject.value?.id === id) {
      this.selectedPlanSubject.next(null);
    }
  }

  /**
   * Duplicate an existing plan
   */
  duplicatePlan(id: string): UpgradePlan | null {
    const originalPlan = this.getPlanById(id);
    if (!originalPlan) {
      console.error(`Plan ${id} not found`);
      return null;
    }

    const plans = this.plansSubject.value;

    const duplicatedPlan: UpgradePlan = {
      ...JSON.parse(JSON.stringify(originalPlan)), // Deep clone
      id: this.generateId(),
      name: `${originalPlan.name} (Copy)`,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    plans.push(duplicatedPlan);
    this.savePlans(plans);

    return duplicatedPlan;
  }

  /**
   * Select a plan
   */
  selectPlan(plan: UpgradePlan | null): void {
    this.selectedPlanSubject.next(plan);
  }

  /**
   * Export all plans as JSON
   */
  exportPlans(): string {
    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      upgradePlans: this.plansSubject.value
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import plans from JSON
   * Merges with existing plans (doesn't replace)
   * Generates new IDs to avoid conflicts
   */
  importPlans(jsonString: string): number {
    try {
      const importData = JSON.parse(jsonString);

      if (!importData.upgradePlans || !Array.isArray(importData.upgradePlans)) {
        throw new Error('Invalid upgrade plans format');
      }

      const existingPlans = this.plansSubject.value;
      const importedPlans: UpgradePlan[] = importData.upgradePlans.map((plan: UpgradePlan) => ({
        ...plan,
        id: this.generateId(), // Generate new ID to avoid conflicts
        createdAt: new Date(plan.createdAt),
        updatedAt: new Date(plan.updatedAt)
      }));

      const mergedPlans = [...existingPlans, ...importedPlans];
      this.savePlans(mergedPlans);

      return importedPlans.length;
    } catch (error) {
      console.error('Error importing upgrade plans:', error);
      throw error;
    }
  }

  /**
   * Clear all plans
   */
  clearAllPlans(): void {
    this.savePlans([]);
    this.selectedPlanSubject.next(null);
  }

  /**
   * Generate unique ID for plans
   */
  private generateId(): string {
    return `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
