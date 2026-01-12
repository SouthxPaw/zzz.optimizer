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
      console.log(`Loaded ${discSets.length} disc sets from IndexedDB`);
    } catch (error) {
      console.error('Error loading disc sets from IndexedDB:', error);
      this.discSetsSubject.next([]);
    }
  }

  getDiscSets(): DiscSet[] {
    return this.discSetsSubject.value;
  }

  getDiscSetById(id: string): DiscSet | undefined {
    return this.discSetsSubject.value.find(s => s.id === id);
  }

  getDiscSetByName(name: string): DiscSet | undefined {
    return this.discSetsSubject.value.find(s => s.name === name);
  }
}
