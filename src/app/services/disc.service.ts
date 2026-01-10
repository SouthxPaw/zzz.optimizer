// services/disc.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Disc, DiscSet, MainStatType, SubStat, SubStatType } from '../models/disc.model';
import { ScoringAlgorithm } from '../models/scoring.model';

@Injectable({
  providedIn: 'root'
})
export class DiscService {
  private discsSubject = new BehaviorSubject<Disc[]>([]);
  public discs$: Observable<Disc[]> = this.discsSubject.asObservable();

  constructor() {
  }

  getDiscs(): Disc[] {
    return this.discsSubject.value;
  }

  getDiscById(uid: string): Disc | undefined {
    return this.discsSubject.value.find(d => d.uid === uid);
  }

  addDisc(disc: Disc): void {
    const current = this.discsSubject.value;
    this.discsSubject.next([...current, disc]);
  }

  updateDisc(uid: string, updates: Partial<Disc>): void {
    const current = this.discsSubject.value;
    const index = current.findIndex(d => d.uid === uid);
    if (index !== -1) {
      current[index] = { ...current[index], ...updates };
      this.discsSubject.next([...current]);
    }
  }

  deleteDisc(uid: string): void {
    const current = this.discsSubject.value.filter(d => d.uid !== uid);
    this.discsSubject.next(current);
  }

  getDiscsBySlot(slot: DiscSet): Disc[] {
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
    // Max roll values for substats (approximate)
    const maxRolls: Record<SubStatType, number> = {
      HP: 337,
      'HP%': 4.8,
      ATK: 19,
      'ATK%': 4.8,
      DEF: 16,
      'DEF%': 6.0,
      CRIT_Rate: 3.2,
      CRIT_DMG: 6.4,
      Anomaly_Proficiency: 9,
      Pen_Ratio: 4.8,
      Impact: 4.8,
      Energy_Regen: 4.8,
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

  importDiscs(discs: Disc[]): void {
    this.discsSubject.next(discs);
  }

  exportDiscs(): string {
    return JSON.stringify(this.discsSubject.value, null, 2);
  }
}
