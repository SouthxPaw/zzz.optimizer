// OPTIMIZATION: Shared disc set data service to avoid duplicate loading
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DISC_SET_EQUIPMENT_IDS } from '../constants/disc-set-ids';
import { versionedUrl } from '../utils/versioned-url';

export interface DiscSetEquipmentData {
  Id: number;
  Name: string;
  Desc2: string;
  Desc4: string;
  '4pcEffect': {
    Properties: Array<{
      Name: string;
      Name2: string;
      Format: string;
      Value: number;
    }>;
  } | Array<{
    Condition?: {
      Type: string;
      Stat: string;
      Operator: string;
      Value: number;
    };
    Properties: Array<{
      Name: string;
      Name2: string;
      Format: string;
      Value: number;
    }>;
  }>;
}

@Injectable({
  providedIn: 'root'
})
export class DiscSetDataService {
  private discSetEquipmentData: { [setName: string]: DiscSetEquipmentData } = {};
  private loadPromise: Promise<void> | null = null;
  private isLoaded = false;

  constructor(private http: HttpClient) {}

  /**
   * Load disc set equipment data once and cache it
   * Subsequent calls return immediately if already loaded
   */
  async loadDiscSetData(): Promise<void> {
    // If already loaded, return immediately
    if (this.isLoaded) {
      return Promise.resolve();
    }

    // If currently loading, return existing promise
    if (this.loadPromise) {
      return this.loadPromise;
    }

    // Start loading
    this.loadPromise = this.loadDataInternal();
    return this.loadPromise;
  }

  private async loadDataInternal(): Promise<void> {
    try {
      const promises = DISC_SET_EQUIPMENT_IDS.map(id =>
        firstValueFrom(
          this.http.get<DiscSetEquipmentData>(versionedUrl(`assets/data/equipment/${id}.json`))
        ).catch(() => null)
      );

      const results = await Promise.all(promises);
      results.forEach(data => {
        if (data) {
          this.discSetEquipmentData[data.Name] = data;
        }
      });

      this.isLoaded = true;
    } catch (error) {
      console.error('DiscSetDataService: Failed to load disc set equipment data:', error);
      throw error;
    }
  }

  /**
   * Get disc set equipment data (must call loadDiscSetData first)
   */
  getDiscSetEquipmentData(): { [setName: string]: DiscSetEquipmentData } {
    if (!this.isLoaded) {
      console.warn('DiscSetDataService: Data not loaded yet, returning empty object');
      return {};
    }
    return this.discSetEquipmentData;
  }

  /**
   * Get specific disc set by name
   */
  getDiscSet(setName: string): DiscSetEquipmentData | undefined {
    return this.discSetEquipmentData[setName];
  }

  /**
   * Check if data is loaded
   */
  isDataLoaded(): boolean {
    return this.isLoaded;
  }
}
