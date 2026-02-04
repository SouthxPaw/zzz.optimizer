import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';
import { DbService } from './db.service';

export interface DiscSetBonus {
  pieces: number;
  description: string;
}

export interface DiscSet {
  id: string;
  name: string;
  bonuses: DiscSetBonus[];
  icon?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DiscSetService {
  private discSetsSubject = new BehaviorSubject<DiscSet[]>([]);
  public discSets$: Observable<DiscSet[]> = this.discSetsSubject.asObservable();

  // Maps for O(1) lookups
  private discSetMapById = new Map<string, DiscSet>();
  private discSetMapByName = new Map<string, DiscSet>();

  constructor(
    private db: DbService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.loadDiscSetsFromDb();
  }

  private async loadDiscSetsFromDb(): Promise<void> {
    // Only run in browser
    if (!isPlatformBrowser(this.platformId)) {
      this.discSetsSubject.next([]);
      return;
    }

    try {
      const discSets = await this.db.getAllDiscSets();
      this.discSetsSubject.next(discSets);

      // Build Maps for O(1) lookups
      this.buildLookupMaps(discSets);

    } catch (error) {
      console.error('Error loading disc sets from IndexedDB:', error);
      this.discSetsSubject.next([]);
      this.clearLookupMaps();
    }
  }

  private buildLookupMaps(discSets: DiscSet[]): void {
    this.clearLookupMaps();

    discSets.forEach(discSet => {
      this.discSetMapById.set(discSet.id, discSet);
      this.discSetMapByName.set(discSet.name, discSet);
    });
  }

  private clearLookupMaps(): void {
    this.discSetMapById.clear();
    this.discSetMapByName.clear();
  }

  /**
   * Reload disc sets from database
   * Called after bulk import to refresh the cache
   */
  async reloadDiscSets(): Promise<void> {
    await this.loadDiscSetsFromDb();
  }

  getDiscSets(): DiscSet[] {
    return this.discSetsSubject.value;
  }

  getDiscSetById(id: string): DiscSet | undefined {
    // O(1) lookup using Map instead of O(n) find
    return this.discSetMapById.get(id);
  }

  getDiscSetByName(name: string): DiscSet | undefined {
    // O(1) lookup using Map instead of O(n) find
    return this.discSetMapByName.get(name);
  }
}
