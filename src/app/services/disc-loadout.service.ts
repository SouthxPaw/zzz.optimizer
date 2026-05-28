import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';
import { DiscLoadout } from '../models/disc-loadout.model';
import { Disc } from '../models/disc.model';

/**
 * Service for managing disc loadouts
 * Allows users to save and load disc configurations per agent
 */
@Injectable({
  providedIn: 'root'
})
export class DiscLoadoutService {
  private loadoutsSubject = new BehaviorSubject<DiscLoadout[]>([]);
  public loadouts$: Observable<DiscLoadout[]> = this.loadoutsSubject.asObservable();

  private readonly STORAGE_KEY = 'zzz-optimizer-disc-loadouts';
  private readonly MAX_LOADOUTS_PER_AGENT = 5;

  // OPTIMIZATION: Cache for per-agent loadout lookups
  private loadoutsByAgentCache = new Map<string, DiscLoadout[]>();

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    this.loadLoadouts();
  }

  /**
   * Load all disc loadouts from localStorage
   */
  private loadLoadouts(): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.loadoutsSubject.next([]);
      return;
    }

    try {
      const loadoutsJson = localStorage.getItem(this.STORAGE_KEY);
      if (loadoutsJson) {
        const loadouts = JSON.parse(loadoutsJson);

        // Convert date strings back to Date objects
        loadouts.forEach((loadout: DiscLoadout) => {
          loadout.createdAt = new Date(loadout.createdAt);
          loadout.updatedAt = new Date(loadout.updatedAt);
        });

        this.loadoutsSubject.next(loadouts);
      }
    } catch (error) {
      console.error('[DiscLoadoutService] Error loading loadouts:', error);
      this.loadoutsSubject.next([]);
    }
  }

  /**
   * Save loadouts to localStorage
   */
  private saveLoadouts(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    try {
      const loadouts = this.loadoutsSubject.value;
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(loadouts));
    } catch (error) {
      console.error('[DiscLoadoutService] Error saving loadouts:', error);
    }
  }

  /**
   * Get all loadouts
   */
  getAllLoadouts(): DiscLoadout[] {
    return this.loadoutsSubject.value;
  }

  /**
   * Get loadouts for a specific agent
   * OPTIMIZED: Uses per-agent caching to avoid repeated filtering
   */
  getLoadoutsByAgentId(agentId: string): DiscLoadout[] {
    // Check cache first
    if (this.loadoutsByAgentCache.has(agentId)) {
      return this.loadoutsByAgentCache.get(agentId)!;
    }

    // Filter and cache result
    const loadouts = this.loadoutsSubject.value.filter(l => l.agentId === agentId);
    this.loadoutsByAgentCache.set(agentId, loadouts);
    return loadouts;
  }

  /**
   * Get a specific loadout by ID
   */
  getLoadoutById(id: string): DiscLoadout | undefined {
    return this.loadoutsSubject.value.find(l => l.id === id);
  }

  /**
   * Check if agent has reached max loadout limit
   */
  canAddLoadout(agentId: string): boolean {
    const agentLoadouts = this.getLoadoutsByAgentId(agentId);
    return agentLoadouts.length < this.MAX_LOADOUTS_PER_AGENT;
  }

  /**
   * Get remaining loadout slots for agent
   */
  getRemainingSlots(agentId: string): number {
    const agentLoadouts = this.getLoadoutsByAgentId(agentId);
    return Math.max(0, this.MAX_LOADOUTS_PER_AGENT - agentLoadouts.length);
  }

  /**
   * Save a new loadout
   */
  saveLoadout(name: string, agentId: string, equippedDiscs: { [slot: string]: Disc }): DiscLoadout | null {
    // Check if agent has reached max loadouts
    if (!this.canAddLoadout(agentId)) {
      console.warn('[DiscLoadoutService] Max loadouts reached for agent:', agentId);
      return null;
    }

    // Validate loadout name
    if (!name || name.trim().length === 0) {
      console.warn('[DiscLoadoutService] Invalid loadout name');
      return null;
    }

    // Create new loadout
    const newLoadout: DiscLoadout = {
      id: this.generateId(),
      name: name.trim(),
      agentId: agentId,
      equippedDiscs: { ...equippedDiscs }, // Deep copy
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Add to loadouts array
    const loadouts = [...this.loadoutsSubject.value, newLoadout];
    this.loadoutsSubject.next(loadouts);
    this.saveLoadouts();

    // Clear cache for this agent
    this.loadoutsByAgentCache.delete(agentId);

    console.log('[DiscLoadoutService] Saved loadout:', newLoadout.name, 'for agent:', agentId);
    return newLoadout;
  }

  /**
   * Update an existing loadout
   */
  updateLoadout(id: string, updates: Partial<DiscLoadout>): DiscLoadout | null {
    const loadouts = this.loadoutsSubject.value;
    const index = loadouts.findIndex(l => l.id === id);

    if (index === -1) {
      console.warn('[DiscLoadoutService] Loadout not found:', id);
      return null;
    }

    // Apply updates
    const updatedLoadout = {
      ...loadouts[index],
      ...updates,
      updatedAt: new Date()
    };

    // Update array
    const newLoadouts = [...loadouts];
    newLoadouts[index] = updatedLoadout;

    this.loadoutsSubject.next(newLoadouts);
    this.saveLoadouts();

    console.log('[DiscLoadoutService] Updated loadout:', id);
    return updatedLoadout;
  }

  /**
   * Delete a loadout
   */
  deleteLoadout(id: string): boolean {
    const loadouts = this.loadoutsSubject.value;
    const loadout = loadouts.find(l => l.id === id);

    if (!loadout) {
      console.warn('[DiscLoadoutService] Loadout not found:', id);
      return false;
    }

    // Remove from array
    const newLoadouts = loadouts.filter(l => l.id !== id);
    this.loadoutsSubject.next(newLoadouts);
    this.saveLoadouts();

    // Clear cache for this agent
    this.loadoutsByAgentCache.delete(loadout.agentId);

    console.log('[DiscLoadoutService] Deleted loadout:', id);
    return true;
  }

  /**
   * Validate a loadout - check if all discs still exist in the provided disc inventory
   * Returns object with validation results and list of missing disc slots
   */
  validateLoadout(loadout: DiscLoadout, availableDiscs: Disc[]): {
    isValid: boolean;
    missingSlots: string[];
    availableSlots: string[];
  } {
    const missingSlots: string[] = [];
    const availableSlots: string[] = [];

    // Create a Set of available disc UIDs for quick lookup
    const availableDiscUids = new Set(availableDiscs.map(d => d.uid));

    // Check each disc in the loadout
    Object.entries(loadout.equippedDiscs).forEach(([slot, disc]) => {
      if (availableDiscUids.has(disc.uid)) {
        availableSlots.push(slot);
      } else {
        missingSlots.push(slot);
      }
    });

    return {
      isValid: missingSlots.length === 0,
      missingSlots,
      availableSlots
    };
  }

  /**
   * Export all loadouts as JSON string
   */
  exportLoadouts(): string {
    return JSON.stringify(this.loadoutsSubject.value, null, 2);
  }

  /**
   * Import loadouts from JSON string
   */
  importLoadouts(json: string): boolean {
    try {
      const loadouts = JSON.parse(json);

      if (!Array.isArray(loadouts)) {
        console.error('[DiscLoadoutService] Invalid loadouts data - not an array');
        return false;
      }

      // Validate loadout structure
      const validLoadouts = loadouts.filter(loadout => {
        return loadout.id && loadout.name && loadout.agentId && loadout.equippedDiscs;
      });

      if (validLoadouts.length !== loadouts.length) {
        console.warn('[DiscLoadoutService] Some loadouts were invalid and skipped');
      }

      // Convert date strings to Date objects
      validLoadouts.forEach((loadout: DiscLoadout) => {
        loadout.createdAt = new Date(loadout.createdAt);
        loadout.updatedAt = new Date(loadout.updatedAt);
      });

      // Merge with existing loadouts (avoid duplicates)
      const existingLoadouts = this.loadoutsSubject.value;
      const existingIds = new Set(existingLoadouts.map(l => l.id));
      const newLoadouts = validLoadouts.filter((l: DiscLoadout) => !existingIds.has(l.id));

      if (newLoadouts.length === 0) {
        console.log('[DiscLoadoutService] No new loadouts to import');
        return true;
      }

      const mergedLoadouts = [...existingLoadouts, ...newLoadouts];
      this.loadoutsSubject.next(mergedLoadouts);
      this.saveLoadouts();

      console.log('[DiscLoadoutService] Imported', newLoadouts.length, 'new loadouts');
      return true;
    } catch (error) {
      console.error('[DiscLoadoutService] Error importing loadouts:', error);
      return false;
    }
  }

  /**
   * Import a single loadout (for build import/export service)
   */
  importLoadout(loadout: DiscLoadout): void {
    // Convert date strings to Date objects if needed
    if (typeof loadout.createdAt === 'string') {
      loadout.createdAt = new Date(loadout.createdAt);
    }
    if (typeof loadout.updatedAt === 'string') {
      loadout.updatedAt = new Date(loadout.updatedAt);
    }

    // Check if loadout already exists
    const existingLoadouts = this.loadoutsSubject.value;
    const existingIndex = existingLoadouts.findIndex(l => l.id === loadout.id);

    if (existingIndex >= 0) {
      // Update existing loadout
      const updated = [...existingLoadouts];
      updated[existingIndex] = loadout;
      this.loadoutsSubject.next(updated);
    } else {
      // Add new loadout
      this.loadoutsSubject.next([...existingLoadouts, loadout]);
    }

    this.saveLoadouts();

    // Clear cache for this agent
    this.loadoutsByAgentCache.delete(loadout.agentId);
  }

  /**
   * Clear all loadouts (for data management)
   */
  clearAllLoadouts(): void {
    this.loadoutsSubject.next([]);
    this.loadoutsByAgentCache.clear();
    this.saveLoadouts();
    console.log('[DiscLoadoutService] All loadouts cleared');
  }

  /**
   * Delete all loadouts for a specific agent
   */
  deleteAllLoadoutsByAgentId(agentId: string): number {
    const loadouts = this.loadoutsSubject.value;
    const filtered = loadouts.filter(l => l.agentId !== agentId);
    const deletedCount = loadouts.length - filtered.length;

    if (deletedCount > 0) {
      this.loadoutsSubject.next(filtered);
      this.saveLoadouts();

      // Clear cache for this agent
      this.loadoutsByAgentCache.delete(agentId);

      console.log('[DiscLoadoutService] Deleted', deletedCount, 'loadouts for agent:', agentId);
    }

    return deletedCount;
  }

  /**
   * Generate a unique ID for a new loadout
   */
  private generateId(): string {
    return 'loadout_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}
