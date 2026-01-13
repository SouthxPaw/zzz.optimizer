import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';
import { DbService } from './db.service';
import { StatCalculatorService } from './stat-calculator.service';
import { Agent, BaseStats } from '../models/agent.model';
import { WEngine } from '../models/wengine.model';
import { Disc } from '../models/disc.model';

/**
 * Represents a user's built character (agent + equipped gear)
 */
export interface AgentBuild {
  id: string; // Unique build ID
  agentId: string; // Reference to agent from reference data
  name: string; // Agent name (for display)
  element: string; // Agent element (for display)
  specialty: string; // Agent specialty (for display)
  level: number; // Agent level (default 60)
  mindscapeLevel: number; // 0-6
  equippedWEngine?: WEngine;
  wEngineRefinement: number; // 1-5 (number of copies: 1 copy = refinement 1, 5 copies = refinement 5)
  equippedDiscs: { [slot: string]: Disc }; // Drive1-6
  calculatedStats: BaseStats; // Final calculated stats
  score: number; // Overall build rating
  createdAt: Date;
  updatedAt: Date;
}

@Injectable({
  providedIn: 'root'
})
export class BuildService {
  private buildsSubject = new BehaviorSubject<AgentBuild[]>([]);
  public builds$: Observable<AgentBuild[]> = this.buildsSubject.asObservable();

  private selectedBuildSubject = new BehaviorSubject<AgentBuild | null>(null);
  public selectedBuild$: Observable<AgentBuild | null> = this.selectedBuildSubject.asObservable();

  constructor(
    private db: DbService,
    private statCalculator: StatCalculatorService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.loadBuilds();
  }

  /**
   * Load all user builds from localStorage
   */
  private async loadBuilds() {
    // Only run in browser
    if (!isPlatformBrowser(this.platformId)) {
      this.buildsSubject.next([]);
      return;
    }

    try {
      const buildsJson = localStorage.getItem('zzz-optimizer-builds');
      if (buildsJson) {
        const builds = JSON.parse(buildsJson);

        // Migrate old builds to add wEngineRefinement field
        builds.forEach((build: AgentBuild) => {
          if (build.wEngineRefinement === undefined) {
            build.wEngineRefinement = 1; // Default to 1 copy
          }
        });

        this.buildsSubject.next(builds);
        console.log(`Loaded ${builds.length} user builds`);
      } else {
        this.buildsSubject.next([]);
      }
    } catch (error) {
      console.error('Error loading builds:', error);
      this.buildsSubject.next([]);
    }
  }

  /**
   * Save builds to localStorage
   */
  private async saveBuilds(builds: AgentBuild[]) {
    // Only run in browser
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    try {
      localStorage.setItem('zzz-optimizer-builds', JSON.stringify(builds));
      this.buildsSubject.next(builds);
    } catch (error) {
      console.error('Error saving builds:', error);
      throw error;
    }
  }

  /**
   * Get all builds
   */
  getBuilds(): AgentBuild[] {
    return this.buildsSubject.value;
  }

  /**
   * Get build by ID
   */
  getBuildById(id: string): AgentBuild | undefined {
    return this.buildsSubject.value.find(b => b.id === id);
  }

  /**
   * Get all builds for a specific agent
   */
  getBuildsByAgentId(agentId: string): AgentBuild[] {
    return this.buildsSubject.value.filter(b => b.agentId === agentId);
  }

  /**
   * Create a new build from a reference agent
   */
  async createBuild(agent: Agent, mindscapeLevel: number = 0): Promise<AgentBuild> {
    const builds = this.buildsSubject.value;

    const newBuild: AgentBuild = {
      id: this.generateId(),
      agentId: agent.id,
      name: agent.name,
      element: agent.element,
      specialty: agent.specialty,
      level: 60,
      mindscapeLevel: mindscapeLevel,
      wEngineRefinement: 1, // Default to 1 copy (refinement 1)
      equippedDiscs: {},
      calculatedStats: { ...agent.lvl60Stats }, // Start with base stats
      score: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    builds.push(newBuild);
    await this.saveBuilds(builds);

    return newBuild;
  }

  /**
   * Update a build
   */
  async updateBuild(id: string, updates: Partial<AgentBuild>): Promise<void> {
    const builds = this.buildsSubject.value;
    const index = builds.findIndex(b => b.id === id);

    if (index === -1) {
      throw new Error(`Build ${id} not found`);
    }

    builds[index] = {
      ...builds[index],
      ...updates,
      updatedAt: new Date()
    };

    // Handle explicit undefined for equippedWEngine (to properly remove it)
    if ('equippedWEngine' in updates && updates.equippedWEngine === undefined) {
      delete builds[index].equippedWEngine;
    }

    // Recalculate stats if equipment or refinement changed
    if (updates.equippedWEngine !== undefined || updates.equippedDiscs !== undefined || 'equippedWEngine' in updates || updates.wEngineRefinement !== undefined) {
      await this.recalculateStats(builds[index]);
    }

    await this.saveBuilds(builds);

    // Update selected build if it's the one being updated
    if (this.selectedBuildSubject.value?.id === id) {
      this.selectedBuildSubject.next(builds[index]);
    }
  }

  /**
   * Recalculate stats for a build based on equipped gear
   */
  private async recalculateStats(build: AgentBuild): Promise<void> {
    // Get the agent reference data
    const agent = await this.db.getAgent(build.agentId);
    if (!agent) {
      console.warn(`Agent ${build.agentId} not found, using cached stats`);
      return;
    }

    // Ensure disc set equipment data is loaded for 4pc effects
    await this.statCalculator.ensureDataLoaded();

    // Calculate final stats using the stat calculator
    build.calculatedStats = this.statCalculator.calculateFinalStats(
      agent,
      build.level,
      build.equippedWEngine || null,
      build.equippedDiscs,
      build.mindscapeLevel,
      build.wEngineRefinement
    );
  }

  /**
   * Delete a build
   */
  async deleteBuild(id: string): Promise<void> {
    const builds = this.buildsSubject.value.filter(b => b.id !== id);
    await this.saveBuilds(builds);

    // Clear selection if deleted build was selected
    if (this.selectedBuildSubject.value?.id === id) {
      this.selectedBuildSubject.next(null);
    }
  }

  /**
   * Select a build
   */
  selectBuild(build: AgentBuild | null): void {
    this.selectedBuildSubject.next(build);
  }

  /**
   * Equip W-Engine to a build
   */
  async equipWEngine(buildId: string, wEngine: WEngine): Promise<void> {
    await this.updateBuild(buildId, {
      equippedWEngine: wEngine
    });
  }

  /**
   * Unequip W-Engine from a build
   */
  async unequipWEngine(buildId: string): Promise<void> {
    await this.updateBuild(buildId, {
      equippedWEngine: undefined
    });
  }

  /**
   * Equip disc to a build
   */
  async equipDisc(buildId: string, disc: Disc): Promise<void> {
    const build = this.getBuildById(buildId);
    if (!build) {
      throw new Error(`Build ${buildId} not found`);
    }

    const equippedDiscs = { ...build.equippedDiscs };
    equippedDiscs[disc.slot] = disc;

    await this.updateBuild(buildId, {
      equippedDiscs: equippedDiscs
    });
  }

  /**
   * Unequip disc from a build
   */
  async unequipDisc(buildId: string, slot: string): Promise<void> {
    const build = this.getBuildById(buildId);
    if (!build) {
      throw new Error(`Build ${buildId} not found`);
    }

    const equippedDiscs = { ...build.equippedDiscs };
    delete equippedDiscs[slot];

    await this.updateBuild(buildId, {
      equippedDiscs: equippedDiscs
    });
  }

  /**
   * Export all user builds as JSON
   */
  exportBuilds(): string {
    return JSON.stringify(this.buildsSubject.value, null, 2);
  }

  /**
   * Import builds from JSON
   */
  async importBuilds(jsonString: string): Promise<number> {
    try {
      const builds: AgentBuild[] = JSON.parse(jsonString);

      if (!Array.isArray(builds)) {
        throw new Error('Invalid builds format');
      }

      await this.saveBuilds(builds);
      return builds.length;
    } catch (error) {
      console.error('Error importing builds:', error);
      throw error;
    }
  }

  /**
   * Clear all builds
   */
  async clearAllBuilds(): Promise<void> {
    await this.saveBuilds([]);
    this.selectedBuildSubject.next(null);
  }

  /**
   * Get all builds (for export)
   */
  async getAllBuilds(): Promise<AgentBuild[]> {
    return this.buildsSubject.value;
  }

  /**
   * Import a single build
   */
  async importBuild(build: AgentBuild): Promise<void> {
    const builds = [...this.buildsSubject.value];

    // Check if build with this ID already exists
    const existingIndex = builds.findIndex(b => b.id === build.id);
    if (existingIndex >= 0) {
      // Replace existing build
      builds[existingIndex] = build;
    } else {
      // Add new build
      builds.push(build);
    }

    await this.saveBuilds(builds);
  }

  /**
   * Generate unique ID for builds
   */
  private generateId(): string {
    return `build_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
