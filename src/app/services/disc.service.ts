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

  constructor(
    private db: DbService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.loadDiscsFromDb();
  }

  private async loadDiscsFromDb(): Promise<void> {
    // Only run in browser
    if (!isPlatformBrowser(this.platformId)) {
      this.discsSubject.next([]);
      return;
    }

    try {
      const discs = await this.db.getAllDiscs();
      this.discsSubject.next(discs);
      console.log(`Loaded ${discs.length} discs from IndexedDB`);
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
    this.discsSubject.next([...current, disc]);
  }

  async updateDisc(uid: string, updates: Partial<Disc>): Promise<void> {
    const current = this.discsSubject.value;
    const index = current.findIndex(d => d.uid === uid);
    if (index !== -1) {
      await this.db.updateDisc(uid, updates);
      current[index] = { ...current[index], ...updates };
      this.discsSubject.next([...current]);
    }
  }

  async deleteDisc(uid: string): Promise<void> {
    await this.db.deleteDisc(uid);
    const current = this.discsSubject.value.filter(d => d.uid !== uid);
    this.discsSubject.next(current);
  }

  getDiscsBySlot(slot: DiscSlot): Disc[] {
    return this.discsSubject.value.filter(d => d.slot === slot);
  }

  getDiscsBySet(setName: string): Disc[] {
    return this.discsSubject.value.filter(d => d.set === setName);
  }

  getUnequippedDiscs(): Disc[] {
    return this.discsSubject.value.filter(d => !d.equippedBy);
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
