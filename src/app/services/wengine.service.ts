// services/wengine.service.ts
import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';
import { WEngine } from '../models/wengine.model';
import { DbService } from './db.service';

@Injectable({
  providedIn: 'root'
})
export class WEngineService {
  private wEnginesSubject = new BehaviorSubject<WEngine[]>([]);
  public wEngines$: Observable<WEngine[]> = this.wEnginesSubject.asObservable();

  // Maps for O(1) lookups
  private wEngineMapById = new Map<string, WEngine>();
  private wEnginesBySpecialty = new Map<string, WEngine[]>();
  private wEnginesByRarity = new Map<'S' | 'A' | 'B', WEngine[]>();
  private signatureWEngineMap = new Map<string, WEngine>();

  constructor(
    private db: DbService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.loadWEngines();
  }

  private async loadWEngines() {
    // Only run in browser
    if (!isPlatformBrowser(this.platformId)) {
      this.wEnginesSubject.next([]);
      return;
    }

    try {
      const wEngines = await this.db.getAllWEngines();
      this.wEnginesSubject.next(wEngines);

      // Build Maps for O(1) lookups
      this.buildLookupMaps(wEngines);

      console.log(`Loaded ${wEngines.length} W-Engines from IndexedDB`);
    } catch (error) {
      console.error('Error loading W-Engines from IndexedDB:', error);
      this.wEnginesSubject.next([]);
      this.clearLookupMaps();
    }
  }

  private buildLookupMaps(wEngines: WEngine[]): void {
    // Clear existing maps
    this.clearLookupMaps();

    // Build all lookup maps
    wEngines.forEach(wEngine => {
      // By ID
      this.wEngineMapById.set(wEngine.id, wEngine);

      // By Specialty
      if (wEngine.specialty) {
        const specialtyList = this.wEnginesBySpecialty.get(wEngine.specialty) || [];
        specialtyList.push(wEngine);
        this.wEnginesBySpecialty.set(wEngine.specialty, specialtyList);
      }

      // By Rarity
      if (wEngine.rarity) {
        const rarityList = this.wEnginesByRarity.get(wEngine.rarity) || [];
        rarityList.push(wEngine);
        this.wEnginesByRarity.set(wEngine.rarity, rarityList);
      }

      // By Signature
      if (wEngine.signature) {
        this.signatureWEngineMap.set(wEngine.signature, wEngine);
      }
    });
  }

  private clearLookupMaps(): void {
    this.wEngineMapById.clear();
    this.wEnginesBySpecialty.clear();
    this.wEnginesByRarity.clear();
    this.signatureWEngineMap.clear();
  }

  getWEngines(): WEngine[] {
    return this.wEnginesSubject.value;
  }

  getWEngineById(id: string): WEngine | undefined {
    // O(1) lookup using Map instead of O(n) find
    return this.wEngineMapById.get(id);
  }

  getWEnginesBySpecialty(specialty: string): WEngine[] {
    // O(1) lookup using Map instead of O(n) filter
    return this.wEnginesBySpecialty.get(specialty) || [];
  }

  getWEnginesByRarity(rarity: 'S' | 'A' | 'B'): WEngine[] {
    // O(1) lookup using Map instead of O(n) filter
    return this.wEnginesByRarity.get(rarity) || [];
  }

  getSignatureWEngine(agentName: string): WEngine | undefined {
    // O(1) lookup using Map instead of O(n) find
    return this.signatureWEngineMap.get(agentName);
  }

  // CRUD operations for W-Engines
  async addWEngine(wEngine: WEngine): Promise<void> {
    try {
      await this.db.addWEngine(wEngine);
      await this.loadWEngines(); // Refresh the list
    } catch (error) {
      console.error('Error adding W-Engine:', error);
      throw error;
    }
  }

  async updateWEngine(id: string, changes: Partial<WEngine>): Promise<void> {
    try {
      await this.db.updateWEngine(id, changes);
      await this.loadWEngines(); // Refresh the list
    } catch (error) {
      console.error('Error updating W-Engine:', error);
      throw error;
    }
  }

  async deleteWEngine(id: string): Promise<void> {
    try {
      await this.db.deleteWEngine(id);
      await this.loadWEngines(); // Refresh the list
    } catch (error) {
      console.error('Error deleting W-Engine:', error);
      throw error;
    }
  }

  async bulkImportWEngines(wEngines: WEngine[]): Promise<void> {
    try {
      await this.db.bulkAddWEngines(wEngines);
      await this.loadWEngines(); // Refresh the list
    } catch (error) {
      console.error('Error bulk importing W-Engines:', error);
      throw error;
    }
  }

  async clearAllWEngines(): Promise<void> {
    try {
      await this.db.wEngines.clear();
      await this.loadWEngines(); // Refresh the list
    } catch (error) {
      console.error('Error clearing W-Engines:', error);
      throw error;
    }
  }
}
