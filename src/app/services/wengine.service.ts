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
      console.log(`Loaded ${wEngines.length} W-Engines from IndexedDB`);
    } catch (error) {
      console.error('Error loading W-Engines from IndexedDB:', error);
      this.wEnginesSubject.next([]);
    }
  }

  getWEngines(): WEngine[] {
    return this.wEnginesSubject.value;
  }

  getWEngineById(id: string): WEngine | undefined {
    return this.wEnginesSubject.value.find(w => w.id === id);
  }

  getWEnginesBySpecialty(specialty: string): WEngine[] {
    return this.wEnginesSubject.value.filter(w => w.specialty === specialty);
  }

  getWEnginesByRarity(rarity: 'S' | 'A' | 'B'): WEngine[] {
    return this.wEnginesSubject.value.filter(w => w.rarity === rarity);
  }

  getSignatureWEngine(agentName: string): WEngine | undefined {
    return this.wEnginesSubject.value.find(w => w.signature === agentName);
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
