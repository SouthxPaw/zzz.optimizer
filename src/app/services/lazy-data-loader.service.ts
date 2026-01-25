// services/lazy-data-loader.service.ts
import { Injectable } from '@angular/core';
import { Agent } from '../models/agent.model';
import { WEngine } from '../models/wengine.model';

/**
 * Service for lazy loading agent and W-engine data by specialty
 * Reduces initial bundle size by loading data on demand
 */
@Injectable({
  providedIn: 'root'
})
export class LazyDataLoaderService {
  private loadedAgentSpecialties = new Set<string>();
  private loadedWEngineSpecialties = new Set<string>();

  private agentCache = new Map<string, Agent[]>();
  private wEngineCache = new Map<string, WEngine[]>();

  constructor() {}

  /**
   * Check if agents for a specialty are already loaded
   */
  isAgentSpecialtyLoaded(specialty: string): boolean {
    return this.loadedAgentSpecialties.has(specialty);
  }

  /**
   * Check if W-engines for a specialty are already loaded
   */
  isWEngineSpecialtyLoaded(specialty: string): boolean {
    return this.loadedWEngineSpecialties.has(specialty);
  }

  /**
   * Load agents for a specific specialty
   * Returns cached data if already loaded
   */
  async loadAgentsBySpecialty(specialty: string): Promise<Agent[]> {
    if (this.agentCache.has(specialty)) {
      return this.agentCache.get(specialty)!;
    }

    // In a real implementation, this would lazy load from assets
    // For now, we'll mark as loaded and return empty array
    // This would be populated by the DataImportService
    this.loadedAgentSpecialties.add(specialty);
    const agents: Agent[] = [];
    this.agentCache.set(specialty, agents);

    return agents;
  }

  /**
   * Load W-engines for a specific specialty
   * Returns cached data if already loaded
   */
  async loadWEnginesBySpecialty(specialty: string): Promise<WEngine[]> {
    if (this.wEngineCache.has(specialty)) {
      return this.wEngineCache.get(specialty)!;
    }

    this.loadedWEngineSpecialties.add(specialty);
    const wEngines: WEngine[] = [];
    this.wEngineCache.set(specialty, wEngines);

    return wEngines;
  }

  /**
   * Preload data for multiple specialties
   */
  async preloadSpecialties(specialties: string[]): Promise<void> {
    const agentPromises = specialties.map(s => this.loadAgentsBySpecialty(s));
    const wEnginePromises = specialties.map(s => this.loadWEnginesBySpecialty(s));

    await Promise.all([...agentPromises, ...wEnginePromises]);
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.agentCache.clear();
    this.wEngineCache.clear();
    this.loadedAgentSpecialties.clear();
    this.loadedWEngineSpecialties.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      agentSpecialtiesLoaded: this.loadedAgentSpecialties.size,
      wEngineSpecialtiesLoaded: this.loadedWEngineSpecialties.size,
      totalAgentsCached: Array.from(this.agentCache.values()).reduce((sum, arr) => sum + arr.length, 0),
      totalWEnginesCached: Array.from(this.wEngineCache.values()).reduce((sum, arr) => sum + arr.length, 0)
    };
  }
}
