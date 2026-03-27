import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { Agent } from '../models/agent.model';
import { WEngine } from '../models/wengine.model';
import { Disc } from '../models/disc.model';
import { environment } from '../../environments/environment';

interface AppMetadata {
  key: string;
  value: string;
}

interface ShareCustomization {
  agentId: string;
  customAgentImage?: string;
  customBackgroundImage?: string;
  customBarImage?: string;
  agentImageArtist?: string;
  backgroundImageArtist?: string;
  barImageArtist?: string;
  accentColor?: string;
}

/**
 * Database Service
 *
 * IMPORTANT DATA ARCHITECTURE:
 * - agents/wEngines tables = REFERENCE DATA (game database, loaded once from assets)
 * - discs table = USER DATA (user's disc inventory)
 * - builds table = USER DATA (user's character builds)
 *
 * Reference data is loaded from assets/data/*.json and should NOT be modified by users.
 * User data is created/modified by users and stored separately.
 */
@Injectable({
  providedIn: 'root'
})
export class DbService extends Dexie {
  // REFERENCE DATA - Loaded from assets, not user-modifiable
  agents!: Table<Agent, string>;
  wEngines!: Table<WEngine, string>;
  discSets!: Table<any, string>;

  // USER DATA - Created and managed by users
  discs!: Table<Disc, string>;

  // APP METADATA - Stores app version, settings, etc.
  metadata!: Table<AppMetadata, string>;

  // SHARE CUSTOMIZATIONS - User's custom share image settings per agent
  shareCustomizations!: Table<ShareCustomization, string>;

  constructor() {
    super('ZZZOptimizerDB');

    this.version(1).stores({
      // Reference data tables
      agents: 'id, name, rarity, element, specialty',
      wEngines: 'id, name, rarity, specialty',

      // User data tables
      discs: 'uid, slot, set, rarity, equippedBy'
    });

    // Version 2: Add disc sets table
    this.version(2).stores({
      // Reference data tables
      agents: 'id, name, rarity, element, specialty',
      wEngines: 'id, name, rarity, specialty',
      discSets: 'id, name',

      // User data tables
      discs: 'uid, slot, set, rarity, equippedBy'
    });

    // Version 3: Add metadata table for version tracking
    this.version(3).stores({
      // Reference data tables
      agents: 'id, name, rarity, element, specialty',
      wEngines: 'id, name, rarity, specialty',
      discSets: 'id, name',

      // User data tables
      discs: 'uid, slot, set, rarity, equippedBy',

      // App metadata
      metadata: 'key'
    });

    // Version 4: Add shareCustomizations table for per-agent share image settings
    this.version(4).stores({
      // Reference data tables
      agents: 'id, name, rarity, element, specialty',
      wEngines: 'id, name, rarity, specialty',
      discSets: 'id, name',

      // User data tables
      discs: 'uid, slot, set, rarity, equippedBy',

      // App metadata
      metadata: 'key',

      // Share customizations
      shareCustomizations: 'agentId'
    });
  }

  // Agent operations
  async addAgent(agent: Agent): Promise<string> {
    return await this.agents.add(agent);
  }

  async updateAgent(id: string, changes: Partial<Agent>): Promise<number> {
    return await this.agents.update(id, changes);
  }

  async deleteAgent(id: string): Promise<void> {
    await this.agents.delete(id);
  }

  async getAgent(id: string): Promise<Agent | undefined> {
    return await this.agents.get(id);
  }

  async getAllAgents(): Promise<Agent[]> {
    return await this.agents.toArray();
  }

  async bulkAddAgents(agents: Agent[]): Promise<string> {
    // Use bulkPut for reference data to allow updates on reload
    return await this.agents.bulkPut(agents, { allKeys: true }) as any;
  }

  // W-Engine operations
  async addWEngine(wEngine: WEngine): Promise<string> {
    return await this.wEngines.add(wEngine);
  }

  async updateWEngine(id: string, changes: Partial<WEngine>): Promise<number> {
    return await this.wEngines.update(id, changes);
  }

  async deleteWEngine(id: string): Promise<void> {
    await this.wEngines.delete(id);
  }

  async getWEngine(id: string): Promise<WEngine | undefined> {
    return await this.wEngines.get(id);
  }

  async getAllWEngines(): Promise<WEngine[]> {
    return await this.wEngines.toArray();
  }

  async bulkAddWEngines(wEngines: WEngine[]): Promise<string> {
    // Use bulkPut for reference data to allow updates on reload
    return await this.wEngines.bulkPut(wEngines, { allKeys: true }) as any;
  }

  // Disc operations
  async addDisc(disc: Disc): Promise<string> {
    return await this.discs.add(disc);
  }

  async updateDisc(uid: string, changes: Partial<Disc>): Promise<number> {
    return await this.discs.update(uid, changes);
  }

  async deleteDisc(uid: string): Promise<void> {
    await this.discs.delete(uid);
  }

  async getDisc(uid: string): Promise<Disc | undefined> {
    return await this.discs.get(uid);
  }

  async getAllDiscs(): Promise<Disc[]> {
    return await this.discs.toArray();
  }

  async bulkAddDiscs(discs: Disc[]): Promise<string> {
    return await this.discs.bulkAdd(discs, { allKeys: true }) as any;
  }

  // Disc Set operations
  async getAllDiscSets(): Promise<any[]> {
    return await this.discSets.toArray();
  }

  async bulkAddDiscSets(discSets: any[]): Promise<string> {
    // Use bulkPut for reference data to allow updates on reload
    return await this.discSets.bulkPut(discSets, { allKeys: true }) as any;
  }

  // Clear user data only (keeps reference data intact)
  async clearUserData(): Promise<void> {
    await this.discs.clear();
  }

  // Clear reference data only
  async clearReferenceData(): Promise<void> {
    await this.agents.clear();
    await this.wEngines.clear();
    await this.discSets.clear();
  }

  // Clear ALL data (both reference and user data)
  async clearAllData(): Promise<void> {
    await this.clearReferenceData();
    await this.clearUserData();
  }

  // Check if reference data is loaded
  async hasReferenceData(): Promise<boolean> {
    const agentCount = await this.agents.count();
    const wEngineCount = await this.wEngines.count();
    const discSetCount = await this.discSets.count();
    return agentCount > 0 && wEngineCount > 0 && discSetCount > 0;
  }

  // Version tracking methods
  async getStoredDataVersion(): Promise<string | null> {
    try {
      const record = await this.metadata.get('dataVersion');
      return record?.value || null;
    } catch {
      return null;
    }
  }

  async setStoredDataVersion(version: string): Promise<void> {
    await this.metadata.put({ key: 'dataVersion', value: version });
  }

  getCurrentAppVersion(): string {
    return environment.appVersion;
  }

  /**
   * Check if reference data needs to be reloaded due to version mismatch
   * Returns true if:
   * - No data exists
   * - Stored version doesn't match current app version
   */
  async needsDataReload(): Promise<boolean> {
    const hasData = await this.hasReferenceData();
    if (!hasData) {
      return true;
    }

    const storedVersion = await this.getStoredDataVersion();
    const currentVersion = this.getCurrentAppVersion();

    if (!storedVersion) {
      return true;
    }

    if (storedVersion !== currentVersion) {
      return true;
    }

    return false;
  }

  // Share customization operations
  async getShareCustomization(agentId: string): Promise<ShareCustomization | undefined> {
    return await this.shareCustomizations.get(agentId);
  }

  async saveShareCustomization(customization: ShareCustomization): Promise<string> {
    return await this.shareCustomizations.put(customization);
  }

  async deleteShareCustomization(agentId: string): Promise<void> {
    await this.shareCustomizations.delete(agentId);
  }

  async getAllShareCustomizations(): Promise<ShareCustomization[]> {
    return await this.shareCustomizations.toArray();
  }
}

// Export the interface for use in other services
export type { ShareCustomization };
