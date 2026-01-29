import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError, from, timer } from 'rxjs';
import { switchMap, catchError, retryWhen, mergeMap } from 'rxjs/operators';
import { Disc, MainStatType, SubStat, SubStatType } from '../models/disc.model';
import { DiscSlot, WEngine } from '../models/agent.model';
import { DbService } from './db.service';
import { DISC_MAIN_STAT_MAX } from '../constants/main-stat-possibilities';

// Enka API response interfaces
interface EnkaResponse {
  PlayerInfo: {
    SocialDetail?: {
      ProfileDetail?: {
        Nickname: string;
        Level: number;
      };
    };
    ShowcaseDetail?: {
      AvatarList: EnkaCharacter[];
    };
  };
}

interface EnkaCharacter {
  Id: number;
  Level: number;
  TalentLevel: number; // Mindscape level (0-6)
  CoreSkillEnhancement: number; // Core skill unlocked enhancements (A-F)
  ClaimedRewardList?: number[]; // Agent promotion rewards
  Weapon?: {
    Id: number;
    Level: number;
    Uid: number;
    BreakLevel: number; // W-Engine modification level
    UpgradeLevel: number; // W-Engine phase level (0-5)
  };
  EquippedList?: EnkaEquipment[];
}

interface EnkaEquipment {
  Slot: number; // 1-6
  Equipment: {
    Id: number;
    Level: number;
    MainPropertyList?: {
      PropertyId: number;
      PropertyValue: number;
    }[];
    RandomPropertyList?: {
      PropertyId: number;
      PropertyValue: number;
      PropertyLevel: number; // Number of rolls
    }[];
  };
}

// Property ID mappings from Enka to app stat types (from official docs)
const MAIN_STAT_PROPERTY_MAP: { [key: number]: MainStatType } = {
  11101: 'HP',          // HP [Base]
  11102: 'HP%',         // HP%
  11103: 'HP',          // HP [Flat]
  12101: 'ATK',         // ATK [Base]
  12102: 'ATK%',        // ATK%
  12103: 'ATK',         // ATK [Flat]
  13101: 'DEF',         // Def [Base]
  13102: 'DEF%',        // Def%
  13103: 'DEF',         // Def [Flat]
  20101: 'CRIT_Rate',   // Crit Rate [Base]
  20103: 'CRIT_Rate',   // Crit Rate [Flat]
  21101: 'CRIT_DMG',    // Crit DMG [Base]
  21103: 'CRIT_DMG',    // Crit DMG [Flat]
  23101: 'Pen_Ratio',   // Pen Ratio [Base]
  23103: 'Pen_Ratio',   // Pen Ratio [Flat]
  30501: 'Energy_Regen',// Energy Regen [Base]
  30502: 'Energy_Regen',// Energy Regen%
  30503: 'Energy_Regen',// Energy Regen [Flat]
  31201: 'Anomaly_Proficiency', // Anomaly Proficiency [Base]
  31203: 'Anomaly_Proficiency', // Anomaly Proficiency [Flat]
  31401: 'Anomaly_Mastery',     // Anomaly Mastery [Base]
  31402: 'Anomaly_Mastery',     // Anomaly Mastery%
  31403: 'Anomaly_Mastery',     // Anomaly Mastery [Flat]
  12201: 'Impact',      // Impact [Base]
  12202: 'Impact',      // Impact%
  // Element DMG stats
  31501: 'Element_DMG', // Physical DMG Bonus [Base]
  31503: 'Element_DMG', // Physical DMG Bonus [Flat]
  31601: 'Element_DMG', // Fire DMG Bonus [Base]
  31603: 'Element_DMG', // Fire DMG Bonus [Flat]
  31701: 'Element_DMG', // Ice DMG Bonus [Base]
  31703: 'Element_DMG', // Ice DMG Bonus [Flat]
  31801: 'Element_DMG', // Electric DMG Bonus [Base]
  31803: 'Element_DMG', // Electric DMG Bonus [Flat]
  31901: 'Element_DMG', // Ether DMG Bonus [Base]
  31903: 'Element_DMG', // Ether DMG Bonus [Flat]
};

// Temporary type that includes Impact/Energy_Regen for API parsing
// We'll filter these out since they can't actually be disc substats
type EnkaSubStatType = SubStatType | 'Impact' | 'Energy_Regen' | 'Anomaly_Mastery';

const SUBSTAT_PROPERTY_MAP: { [key: number]: EnkaSubStatType } = {
  11103: 'HP',          // HP [Flat]
  11102: 'HP%',         // HP%
  12103: 'ATK',         // ATK [Flat]
  12102: 'ATK%',        // ATK%
  13103: 'DEF',         // Def [Flat]
  13102: 'DEF%',        // Def%
  20103: 'CRIT_Rate',   // Crit Rate [Flat]
  21103: 'CRIT_DMG',    // Crit DMG [Flat]
  23203: 'PEN',         // PEN [Flat]
  23103: 'PEN',         // Pen Ratio [Flat] - maps to PEN
  31203: 'Anomaly_Proficiency', // Anomaly Proficiency [Flat]
  31403: 'Anomaly_Mastery',     // Anomaly Mastery [Flat]
  30503: 'Energy_Regen',        // Energy Regen [Flat] - Invalid but Enka may send it
  12202: 'Impact',      // Impact% - Invalid but Enka may send it
};

// Disc set ID mapping (Enka disc set ID to app disc set name)
// The disc ID from Enka is formatted as: [SetID][Slot] (e.g., 32241 = set 3220, slot 1)
// We extract the set by dividing by 10 and rounding down to nearest 100
const DISC_SET_MAP: { [key: number]: string } = {
  31000: 'Woodpecker Electro',
  31100: 'Puffer Electro',
  31200: 'Shockstar Disco',
  31300: 'Freedom Blues',
  31400: 'Hormone Punk',
  31500: 'Soul Rock',
  31600: 'Swing Jazz',
  31800: 'Chaos Jazz',
  31900: 'Proto Punk',
  32200: 'Inferno Metal',
  32300: 'Chaotic Metal',
  32400: 'Thunder Metal',
  32500: 'Polar Metal',
  32600: 'Fanged Metal',
  32700: 'Branch & Blade Song',
  32800: 'Astral Voice',
  32900: 'Shadow Harmony',
  33000: "Phaethon's Melody",
  33100: 'Yunkui Tales',
  33200: 'King of the Summit',
  33300: "Dawn's Bloom",
  33400: 'Moonlight Lullaby',
  33500: 'White Water Ballad',
  33600: 'Shining Aria'
};

@Injectable({
  providedIn: 'root'
})
export class EnkaApiService {
  // Using CORS proxy to avoid CORS issues in browser
  // Alternative proxies:
  // - 'https://corsproxy.io/?'
  // - 'https://api.allorigins.win/raw?url='
  // - Direct API when CORS is fixed: 'https://enka.network/api/zzz/uid'
  private readonly CORS_PROXY = 'https://corsproxy.io/?';
  private readonly ENKA_API_URL = 'https://enka.network/api/zzz/uid';

  constructor(
    private http: HttpClient,
    private dbService: DbService
  ) {}

  /**
   * Fetch player data from Enka Network API by UID
   * OPTIMIZATION: Added retry logic with exponential backoff for rate limits
   */
  fetchPlayerData(uid: string): Observable<EnkaImportResult> {
    // Use CORS proxy to avoid browser CORS restrictions
    const enkaUrl = `${this.ENKA_API_URL}/${uid}`;
    const proxiedUrl = `${this.CORS_PROXY}${encodeURIComponent(enkaUrl)}`;

    return this.http.get<EnkaResponse>(proxiedUrl).pipe(
      // OPTIMIZATION: Retry on rate limit (429) with exponential backoff
      retryWhen(errors =>
        errors.pipe(
          mergeMap((error, index) => {
            // Only retry on rate limit errors
            if (error.status === 429 && index < 3) {
              const delay = Math.pow(2, index) * 500; // 500ms, 1s, 2s
              console.log(`Rate limited. Retrying in ${delay}ms (attempt ${index + 1}/3)...`);
              return timer(delay);
            }
            // Don't retry other errors
            return throwError(() => error);
          })
        )
      ),
      switchMap(response => from(this.transformEnkaData(uid, response))),
      catchError(error => {
        console.error('Enka API error:', error);
        let errorMessage = 'Failed to fetch data from provided UID';

        if (error.status === 404) {
          errorMessage = 'UID not found. Make sure your profile is public in game settings or double check your UID.';
        } else if (error.status === 429) {
          errorMessage = 'Rate limited after 3 retries. Please wait a moment and try again.';
        } else if (error.status === 0) {
          errorMessage = 'CORS error. The API might be blocking requests. Try again later or contact support.';
        } else if (error.status >= 500) {
          errorMessage = 'Server error. Please try again later.';
        }

        return throwError(() => new Error(errorMessage));
      })
    );
  }

  /**
   * Transform Enka API response into app data models
   */
  private async transformEnkaData(uid: string, data: EnkaResponse): Promise<EnkaImportResult> {
    const builds: EnkaBuildData[] = [];
    const discs: Disc[] = [];

    const avatarList = data.PlayerInfo?.ShowcaseDetail?.AvatarList || [];

    // Get reference data for validation
    const [referenceAgents, referenceWEngines] = await Promise.all([
      this.dbService.getAllAgents(),
      this.dbService.getAllWEngines()
    ]);

    for (const character of avatarList) {
      // Validate agent exists in reference data
      const agentId = character.Id.toString();
      const agent = referenceAgents.find(a => a.id === agentId);

      if (!agent) {
        console.warn(`Unknown agent ID from Enka: ${agentId}`);
        continue;
      }

      // Transform W-Engine
      let wEngine: WEngine | undefined;
      let wEngineLevel: number | undefined;
      let wEngineRefinement: number = 1;

      if (character.Weapon) {
        const wEngineId = character.Weapon.Id.toString();
        wEngine = referenceWEngines.find(w => w.id === wEngineId);

        if (!wEngine) {
          console.warn(`Unknown W-Engine ID from Enka: ${wEngineId}`);
        } else {
          wEngineLevel = character.Weapon.Level;
          // UpgradeLevel is the W-Engine Phase Level which represents refinement (W1-W5)
          // UpgradeLevel 1 = W1, UpgradeLevel 5 = W5
          wEngineRefinement = Math.max(1, Math.min(character.Weapon.UpgradeLevel || 1, 5));
          console.log(`W-Engine ${wEngineId}: UpgradeLevel=${character.Weapon.UpgradeLevel} → Refinement=W${wEngineRefinement}`);
        }
      }

      // Transform Discs
      const characterDiscs: { [key in DiscSlot]?: Disc } = {};

      if (character.EquippedList) {
        console.log(`Character ${agentId} has ${character.EquippedList.length} equipped items`);
        for (const equipped of character.EquippedList) {
          const disc = this.transformDisc(equipped, agentId);
          if (disc) {
            characterDiscs[disc.slot] = disc;
            discs.push(disc);
            console.log(`  Added disc slot ${disc.slot}: ${disc.set}`);
          } else {
            console.warn(`  Failed to transform disc in slot ${equipped.Slot}`);
          }
        }
      } else {
        console.warn(`Character ${agentId} has no EquippedList!`);
      }

      // Mindscape level from TalentLevel field
      const mindscapeLevel = (character.TalentLevel || 0) as (0 | 1 | 2 | 3 | 4 | 5 | 6);

      console.log(`Character ${agentId} - Level: ${character.Level}, Mindscape: M${mindscapeLevel}, W-Engine: ${wEngine?.name || 'None'} (W${wEngineRefinement}), Discs: ${Object.keys(characterDiscs).length}/6`);

      builds.push({
        agentId,
        level: character.Level,
        mindscapeLevel,
        wEngine,
        wEngineLevel,
        wEngineRefinement,
        discs: characterDiscs
      });
    }

    const playerInfo = data.PlayerInfo?.SocialDetail?.ProfileDetail;

    return {
      uid,
      playerName: playerInfo?.Nickname || 'Unknown',
      playerLevel: playerInfo?.Level || 0,
      builds,
      totalDiscs: discs.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Transform Enka disc equipment to app Disc model
   */
  private transformDisc(equipped: EnkaEquipment, agentId: string): Disc | null {
    const disc = equipped.Equipment;
    const slot = this.mapSlotToDiscSlot(equipped.Slot);

    if (!slot) {
      console.warn(`Invalid disc slot: ${equipped.Slot}`);
      return null;
    }

    // Get disc set name and rarity
    // Disc ID format: [SuitId][Rarity][Slot] (e.g., 32241 = set 32200, rarity 4 (S), slot 1)
    // Extract: last digit = slot, 2nd last = rarity (2=B, 3=A, 4=S), rest = suit
    const discIdStr = disc.Id.toString();
    const rarityDigit = parseInt(discIdStr[discIdStr.length - 2]);
    const suitIdStr = discIdStr.substring(0, discIdStr.length - 2) + '00';
    const setId = parseInt(suitIdStr);

    const setName = DISC_SET_MAP[setId] || `Unknown Set ${setId}`;
    const rarity: 'B' | 'A' | 'S' = rarityDigit === 2 ? 'B' : rarityDigit === 3 ? 'A' : 'S';

    // Parse main stat
    const mainStatData = disc.MainPropertyList?.[0];
    if (!mainStatData) {
      console.warn(`Disc missing main stat`);
      return null;
    }

    const mainStatType = MAIN_STAT_PROPERTY_MAP[mainStatData.PropertyId];
    if (!mainStatType) {
      console.warn(`Unknown main stat property ID: ${mainStatData.PropertyId}`);
      return null;
    }

    // Calculate main stat value from app constants
    let mainStatValue = 0;
    const slotNum = parseInt(slot.replace('Drive', ''));
    if (slotNum >= 1 && slotNum <= 3) {
      // Drive 1-3 have fixed main stats
      const fixedValues: Record<string, number> = {
        'Drive1': 2200,  // HP
        'Drive2': 316,   // ATK
        'Drive3': 184    // DEF
      };
      mainStatValue = fixedValues[slot] || 0;
    } else if (slotNum >= 4 && slotNum <= 6) {
      // Drive 4-6 use DISC_MAIN_STAT_MAX lookup
      const slotKey = slot as 'Drive4' | 'Drive5' | 'Drive6';
      const maxValues = DISC_MAIN_STAT_MAX[slotKey];
      if (maxValues && maxValues[mainStatType] !== undefined) {
        mainStatValue = maxValues[mainStatType];
      }
    }

    // Parse substats
    const subStats: SubStat[] = [];
    if (disc.RandomPropertyList) {
      for (const subStatData of disc.RandomPropertyList) {
        const subStatType = SUBSTAT_PROPERTY_MAP[subStatData.PropertyId];
        if (!subStatType) {
          console.warn(`Unknown substat property ID: ${subStatData.PropertyId}`);
          continue;
        }

        // Filter out Impact and Energy_Regen - these can only be main stats, not substats
        if (subStatType === 'Impact' || subStatType === 'Energy_Regen') {
          console.warn(`Ignoring invalid disc substat: ${subStatType} (property ID ${subStatData.PropertyId})`);
          continue;
        }

        // Convert substat value using rolls
        const subStatValue = this.convertSubstatValue(
          subStatData.PropertyId,
          subStatData.PropertyValue,
          subStatData.PropertyLevel || 1
        );

        subStats.push({
          type: subStatType as SubStatType, // Safe cast after filtering
          value: subStatValue,
          rolls: subStatData.PropertyLevel || 1
        });
      }
    }

    return {
      uid: `enka-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      slot,
      set: setName,
      rarity,
      level: disc.Level,
      mainStat: {
        type: mainStatType,
        value: mainStatValue
      },
      subStats,
      equippedBy: agentId,
      lock: false
    };
  }

  /**
   * Map Enka slot number (1-6) to app DiscSlot
   */
  private mapSlotToDiscSlot(slot: number): DiscSlot | null {
    const slotMap: { [key: number]: DiscSlot } = {
      1: 'Drive1',
      2: 'Drive2',
      3: 'Drive3',
      4: 'Drive4',
      5: 'Drive5',
      6: 'Drive6'
    };
    return slotMap[slot] || null;
  }

  /**
   * Convert Enka substat value to app value format
   * Substats need to be multiplied by PropertyLevel (number of rolls)
   */
  private convertSubstatValue(propertyId: number, value: number, propertyLevel: number): number {
    // Percentage stats: divide by 100, then multiply by rolls
    const percentagePropertyIds = [
      11102, 12102, 13102, // HP%, ATK%, DEF%
      20103, // CRIT_Rate
      21103, // CRIT_DMG
      23103, // PEN_Ratio
      30502, 30503, // Energy_Regen
      31402, 31403, // Anomaly_Mastery
      12202 // Impact%
    ];

    if (percentagePropertyIds.includes(propertyId)) {
      // Example: 240 value with 3 rolls → (240/100) * 3 = 2.4 * 3 = 7.2%
      // Round to 1 decimal place to avoid floating point errors like 7.1999999999999
      const result = (value / 100) * propertyLevel;
      return Math.round(result * 10) / 10;
    }

    // Flat stats: multiply by rolls
    // Example: 15 value with 3 rolls → 15 * 3 = 45
    // Round to nearest integer to avoid floating point errors
    return Math.round(value * propertyLevel);
  }
}

// Result types
export interface EnkaImportResult {
  uid: string;
  playerName: string;
  playerLevel: number;
  builds: EnkaBuildData[];
  totalDiscs: number;
  timestamp: string;
}

export interface EnkaBuildData {
  agentId: string;
  level: number;
  mindscapeLevel: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  wEngine?: WEngine;
  wEngineLevel?: number;
  wEngineRefinement?: number;
  discs: {
    [key in DiscSlot]?: Disc;
  };
}
