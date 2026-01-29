// services/disc.service.ts
import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';
import { Disc } from '../models/disc.model';
import { DiscSlot } from '../models/agent.model';
import { DbService } from './db.service';

@Injectable({
  providedIn: 'root'
})
export class DiscService {
  private discsSubject = new BehaviorSubject<Disc[]>([]);
  public discs$: Observable<Disc[]> = this.discsSubject.asObservable();

  // OPTIMIZATION: Pre-indexed discs for O(1) lookups
  private discsBySlot = new Map<DiscSlot, Disc[]>();
  private discsBySet = new Map<string, Disc[]>();
  private unequippedDiscs: Disc[] = [];

  constructor(
    private db: DbService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.loadDiscsFromDb();
  }

  // OPTIMIZATION: Rebuild indexes when discs change
  private rebuildIndexes(discs: Disc[]): void {
    // Clear existing indexes
    this.discsBySlot.clear();
    this.discsBySet.clear();
    this.unequippedDiscs = [];

    // Rebuild indexes
    for (const disc of discs) {
      // Index by slot
      if (!this.discsBySlot.has(disc.slot)) {
        this.discsBySlot.set(disc.slot, []);
      }
      this.discsBySlot.get(disc.slot)!.push(disc);

      // Index by set
      if (!this.discsBySet.has(disc.set)) {
        this.discsBySet.set(disc.set, []);
      }
      this.discsBySet.get(disc.set)!.push(disc);

      // Index unequipped
      if (!disc.equippedBy) {
        this.unequippedDiscs.push(disc);
      }
    }
  }

  private async loadDiscsFromDb(): Promise<void> {
    // Only run in browser
    if (!isPlatformBrowser(this.platformId)) {
      this.discsSubject.next([]);
      return;
    }

    try {
      const discs = await this.db.getAllDiscs();
      this.rebuildIndexes(discs); // OPTIMIZATION: Build indexes
      this.discsSubject.next(discs);
      console.log(`Loaded ${discs.length} discs from IndexedDB (indexed by slot/set)`);
    } catch (error) {
      console.error('Error loading discs from IndexedDB:', error);
      this.discsSubject.next([]);
    }
  }

  getDiscs(): Disc[] {
    return this.discsSubject.value;
  }

  getDiscById(uid: string): Disc | undefined {
    return this.discsSubject.value.find(d => d.uid === uid);
  }

  async addDisc(disc: Disc): Promise<void> {
    await this.db.addDisc(disc);
    const current = this.discsSubject.value;
    const updated = [...current, disc];
    this.rebuildIndexes(updated); // OPTIMIZATION: Rebuild indexes
    this.discsSubject.next(updated);
  }

  async updateDisc(uid: string, updates: Partial<Disc>): Promise<void> {
    const current = this.discsSubject.value;
    const index = current.findIndex(d => d.uid === uid);
    if (index !== -1) {
      await this.db.updateDisc(uid, updates);
      current[index] = { ...current[index], ...updates };
      this.rebuildIndexes(current); // OPTIMIZATION: Rebuild indexes
      this.discsSubject.next([...current]);
    }
  }

  async deleteDisc(uid: string): Promise<void> {
    await this.db.deleteDisc(uid);
    const current = this.discsSubject.value.filter(d => d.uid !== uid);
    this.rebuildIndexes(current); // OPTIMIZATION: Rebuild indexes
    this.discsSubject.next(current);
  }

  // OPTIMIZATION: Use indexed lookup (O(1) instead of O(n))
  getDiscsBySlot(slot: DiscSlot): Disc[] {
    return this.discsBySlot.get(slot) || [];
  }

  // OPTIMIZATION: Use indexed lookup (O(1) instead of O(n))
  getDiscsBySet(setName: string): Disc[] {
    return this.discsBySet.get(setName) || [];
  }

  // OPTIMIZATION: Use pre-filtered unequipped list
  getUnequippedDiscs(): Disc[] {
    return this.unequippedDiscs;
  }

  /**
   * OPTIMIZATION 7: Get unequipped discs above a minimum level for optimization
   * Reduces search space by filtering out low-level discs
   */
  getUnequippedDiscsForOptimization(minLevel: number = 0): Disc[] {
    if (minLevel <= 0) {
      return this.getUnequippedDiscs();
    }
    return this.discsSubject.value.filter(d => !d.equippedBy && d.level >= minLevel);
  }

  getDiscsEquippedBy(agentId: string): Disc[] {
    return this.discsSubject.value.filter(d => d.equippedBy === agentId);
  }

  equipDisc(uid: string, agentId: string): void {
    const disc = this.getDiscById(uid);
    if (disc) {
      // Unequip any disc in the same slot from this agent
      const sameSlotDisc = this.getDiscsEquippedBy(agentId)
        .find(d => d.slot === disc.slot);
      if (sameSlotDisc) {
        this.updateDisc(sameSlotDisc.uid, { equippedBy: undefined });
      }

      // Equip the new disc
      this.updateDisc(uid, { equippedBy: agentId });
    }
  }

  unequipDisc(uid: string): void {
    this.updateDisc(uid, { equippedBy: undefined });
  }

  // Legacy scoring methods removed - now handled by ScoringService

  async importDiscs(discs: Disc[]): Promise<void> {
    await this.db.bulkAddDiscs(discs);
    this.rebuildIndexes(discs); // OPTIMIZATION: Rebuild indexes
    this.discsSubject.next(discs);
  }

  exportDiscs(): string {
    return JSON.stringify(this.discsSubject.value, null, 2);
  }

  async getAllDiscs(): Promise<Disc[]> {
    return this.discsSubject.value;
  }

  async clearAllDiscs(): Promise<void> {
    // Clear from database
    const allDiscs = this.discsSubject.value;
    for (const disc of allDiscs) {
      await this.db.deleteDisc(disc.uid);
    }
    this.discsSubject.next([]);
  }
}
