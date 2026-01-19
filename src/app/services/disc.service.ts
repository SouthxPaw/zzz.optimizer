// services/disc.service.ts
import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';
import { Disc, SubStat, SubStatType } from '../models/disc.model';
import { ScoringAlgorithm } from '../models/scoring.model';
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

  scoreDisc(disc: Disc, algorithm: ScoringAlgorithm): number {
    let score = 0;

    // Score substats based on weights
    disc.subStats.forEach(subStat => {
      const weight = algorithm.weights[subStat.type] || 0;
      // Normalize the value (divide by typical max roll value)
      const normalizedValue = this.normalizeSubstatValue(subStat);
      score += normalizedValue * weight;
    });

    // Bonus for preferred main stat
    const preferredMainStats = algorithm.mainStatPreferences[disc.slot] || [];
    if (preferredMainStats.includes(disc.mainStat.type)) {
      score *= 1.2; // 20% bonus
    }

    return Math.round(score * 100) / 100;
  }

  private normalizeSubstatValue(subStat: SubStat): number {
    // Max roll values for substats (6 rolls: 1 initial + 5 upgrades)
    // Values from: https://www.prydwen.gg/zenless/guides/disk-drives-stats/
    const maxRolls: Record<SubStatType, number> = {
      HP: 672,                // 112 × 6 rolls
      'HP%': 18.0,            // 3.0% × 6 rolls
      ATK: 114,               // 19 × 6 rolls
      'ATK%': 18.0,           // 3.0% × 6 rolls
      DEF: 96,                // 16 × 6 rolls (estimated)
      'DEF%': 28.8,           // 4.8% × 6 rolls
      CRIT_Rate: 14.4,        // 2.4% × 6 rolls
      CRIT_DMG: 28.8,         // 4.8% × 6 rolls
      Anomaly_Proficiency: 54, // 9 × 6 rolls
      Anomaly_Mastery: 54,    // 9 × 6 rolls (estimated)
      PEN: 54,                // 9 × 6 rolls
      Impact: 54,             // 9 × 6 rolls (estimated)
      Energy_Regen: 28.8,     // 4.8% × 6 rolls (estimated)
    };

    const maxRoll = maxRolls[subStat.type] || 1;
    return subStat.value / maxRoll;
  }

  calculatePotential(disc: Disc, targetLevel: number = 15): {
    current: number;
    averagePotential: number;
    maxPotential: number;
  } {
    const remainingRolls = Math.floor((targetLevel - disc.level) / 3);
    const currentScore = this.calculateRelativeScore(disc);

    // Average potential assumes average rolls
    const avgRollValue = 0.6; // 60% of max roll on average
    const avgPotential = currentScore + (remainingRolls * avgRollValue * disc.subStats.length);

    // Max potential assumes all max rolls
    const maxPotential = currentScore + (remainingRolls * 1.0 * disc.subStats.length);

    return {
      current: Math.round(currentScore * 100) / 100,
      averagePotential: Math.round(avgPotential * 100) / 100,
      maxPotential: Math.round(maxPotential * 100) / 100,
    };
  }

  private calculateRelativeScore(disc: Disc): number {
    let score = 0;
    disc.subStats.forEach(sub => {
      score += this.normalizeSubstatValue(sub);
    });
    return score;
  }

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
