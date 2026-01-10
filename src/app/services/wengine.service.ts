// services/wengine.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';

export interface WEngine {
  id: string;
  name: string;
  rarity: 'S' | 'A' | 'B';
  specialty: 'Attack' | 'Stun' | 'Anomaly' | 'Support' | 'Defense';
  baseAtk: number;
  subStat: {
    type: 'ATK%' | 'HP%' | 'DEF%' | 'CRIT_Rate' | 'CRIT_DMG' | 'PEN_Ratio' | 'Energy_Regen' | 'Impact' | 'Anomaly_Proficiency';
    value: number;
  };
  effect: {
    name: string;
    description: string;
    maxRefinement?: string;
  };
  signature?: string;
}

interface WEngineData {
  meta: {
    version: string;
    lastUpdated: string;
    totalCount: number;
    note: string;
  };
  wEngines: WEngine[];
}

@Injectable({
  providedIn: 'root'
})
export class WEngineService {
  private wEnginesSubject = new BehaviorSubject<WEngine[]>([]);
  public wEngines$: Observable<WEngine[]> = this.wEnginesSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadWEngines();
  }

  private async loadWEngines() {
    try {
      // Load from JSON file in assets folder
      const data = await firstValueFrom(
        this.http.get<WEngineData>('assets/data/wengines.json')
      );

      this.wEnginesSubject.next(data.wEngines);
      console.log(`Loaded ${data.wEngines.length} W-Engines`);
    } catch (error) {
      console.error('Error loading W-Engines:', error);
      // Fallback to empty array if file not found
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
}

/*
 * Usage in your Angular app:
 *
 * 1. Create folder structure:
 *    src/
 *      assets/
 *        data/
 *          wengines.json      <- Place your W-Engine JSON here
 *          agents.json        <- Place your Agent JSON here
 *          disc-sets.json     <- Place your Disc Sets JSON here
 *
 * 2. Make sure HttpClientModule is imported in your app:
 *    In app.config.ts or app.module.ts:
 *    import { provideHttpClient } from '@angular/common/http';
 *
 *    providers: [
 *      provideHttpClient()
 *    ]
 *
 * 3. The service will automatically load on initialization
 *
 * 4. Use in components:
 *    constructor(private wEngineService: WEngineService) {}
 *
 *    ngOnInit() {
 *      const wEngines = this.wEngineService.getWEngines();
 *      // or subscribe to changes:
 *      this.wEngineService.wEngines$.subscribe(engines => {
 *        console.log('W-Engines loaded:', engines);
 *      });
 *    }
 */
