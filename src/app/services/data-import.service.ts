import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DbService } from './db.service';
import { AgentService } from './agent.service';
import { WEngineService } from './wengine.service';
import { DiscSetService } from './disc-set.service';
import { DataTransformerService } from './data-transformer.service';
import { BuildService } from './build.service';
import { Agent } from '../models/agent.model';
import { WEngine } from '../models/wengine.model';
import { Disc } from '../models/disc.model';
import { DISC_SET_EQUIPMENT_IDS } from '../constants/disc-set-ids';
import { versionedUrl } from '../utils/versioned-url';

/**
 * Data Import/Export Service
 *
 * IMPORTANT: This service handles TWO types of data:
 *
 * 1. REFERENCE DATA (from assets/data/*.json):
 *    - agents.json, wengines.json
 *    - Loaded ONCE on app initialization
 *    - Should NOT be overwritten or modified
 *    - Provides the game database for builds
 *
 * 2. USER DATA (user's personal data):
 *    - User's disc inventory
 *    - User's character builds
 *    - Can be imported/exported for backup
 *    - Stored separately from reference data
 */
@Injectable({
  providedIn: 'root'
})
export class DataImportService {
  constructor(
    private http: HttpClient,
    private db: DbService,
    private agentService: AgentService,
    private wEngineService: WEngineService,
    private discSetService: DiscSetService,
    private transformer: DataTransformerService,
    private buildService: BuildService
  ) {}

  /**
   * Import REFERENCE DATA: agents from a JSON file in the assets folder
   * This loads the game's agent database and should only be done once on initialization.
   * Does NOT modify existing reference data.
   *
   * @param filePath Path to JSON file (e.g., 'assets/data/agents.json')
   * @param transformRawData If true, transforms raw game data format to app format
   */
  async importAgentsFromFile(filePath: string = 'assets/data/agents.json', transformRawData: boolean = true): Promise<number> {
    try {
      // Use relative path (without leading /) to work with baseHref
      const relativePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
      console.log(`Attempting to load agents from: ${relativePath}`);
      const rawData = await firstValueFrom(this.http.get<any>(versionedUrl(relativePath)));

      let agents: Agent[];

      if (transformRawData) {
        // Transform raw game data (object with numeric IDs) to Agent[]
        console.log('Transforming raw agent data...');
        agents = this.transformer.transformAgents(rawData);
      } else {
        // Handle already-formatted data
        agents = Array.isArray(rawData) ? rawData : rawData.agents || [];
      }

      if (agents.length === 0) {
        console.warn('No agents found in file');
        return 0;
      }

      await this.agentService.bulkImportAgents(agents);
      console.log(`Successfully imported ${agents.length} agents`);
      return agents.length;
    } catch (error) {
      console.error('Error importing agents from file:', error);
      throw error;
    }
  }

  /**
   * Import REFERENCE DATA: W-Engines from a JSON file in the assets folder
   * This loads the game's W-Engine database and should only be done once on initialization.
   * Does NOT modify existing reference data.
   *
   * @param filePath Path to JSON file (e.g., 'assets/data/wengines.json')
   * @param transformRawData If true, transforms raw game data format to app format
   */
  async importWEnginesFromFile(filePath: string = 'assets/data/wengines.json', transformRawData: boolean = true): Promise<number> {
    try {
      // Use relative path (without leading /) to work with baseHref
      const relativePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
      const rawData = await firstValueFrom(this.http.get<any>(versionedUrl(relativePath)));

      let wEngines: WEngine[];

      if (transformRawData) {
        // Transform raw game data (object with numeric IDs) to WEngine[]
        console.log('Transforming raw W-Engine data...');
        wEngines = this.transformer.transformWEngines(rawData);
      } else {
        // Handle already-formatted data
        wEngines = Array.isArray(rawData) ? rawData : rawData.wEngines || [];
      }

      if (wEngines.length === 0) {
        console.warn('No W-Engines found in file');
        return 0;
      }

      await this.wEngineService.bulkImportWEngines(wEngines);
      console.log(`Successfully imported ${wEngines.length} W-Engines`);
      return wEngines.length;
    } catch (error) {
      console.error('Error importing W-Engines from file:', error);
      throw error;
    }
  }

  /**
   * Import USER DATA: discs from a JSON file
   * This imports the user's disc inventory (their personal collection).
   * Can be used for backup/restore of user data.
   *
   * @param filePath Path to JSON file (e.g., 'assets/data/sample-discs.json')
   */
  async importDiscsFromFile(filePath: string = 'assets/data/sample-discs.json'): Promise<number> {
    try {
      // Use relative path (without leading /) to work with baseHref
      const relativePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
      const data = await firstValueFrom(this.http.get<any>(versionedUrl(relativePath)));

      // Handle both array format and object with 'discs' property
      const discs: Disc[] = Array.isArray(data) ? data : data.discs || [];

      if (discs.length === 0) {
        console.warn('No discs found in file');
        return 0;
      }

      await this.db.bulkAddDiscs(discs);
      console.log(`Successfully imported ${discs.length} discs`);
      return discs.length;
    } catch (error) {
      console.error('Error importing discs from file:', error);
      throw error;
    }
  }

  /**
   * Import all REFERENCE DATA from the assets folder
   * This loads the game database (agents, W-Engines) on first run.
   * Should only be called once or when updating the game database.
   */
  async importAllReferenceData(): Promise<{agents: number, wEngines: number}> {
    const results = {
      agents: 0,
      wEngines: 0
    };

    try {
      results.agents = await this.importAgentsFromFile();
    } catch (error) {
      console.warn('Skipping agents import:', error);
    }

    try {
      results.wEngines = await this.importWEnginesFromFile();
    } catch (error) {
      console.warn('Skipping W-Engines import:', error);
    }

    return results;
  }

  /**
   * Import all data (both reference and user data) from the assets folder
   * Use this for initial setup or full restore.
   */
  async importAllData(): Promise<{agents: number, wEngines: number, discs: number}> {
    const results = {
      agents: 0,
      wEngines: 0,
      discs: 0
    };

    try {
      results.agents = await this.importAgentsFromFile();
    } catch (error) {
      console.warn('Skipping agents import:', error);
    }

    try {
      results.wEngines = await this.importWEnginesFromFile();
    } catch (error) {
      console.warn('Skipping W-Engines import:', error);
    }

    try {
      results.discs = await this.importDiscsFromFile();
    } catch (error) {
      console.warn('Skipping discs import:', error);
    }

    return results;
  }

  /**
   * Import from user-provided JSON string
   */
  async importFromJSON(jsonString: string, type: 'agents' | 'wEngines' | 'discs'): Promise<number> {
    try {
      const data = JSON.parse(jsonString);
      const items = Array.isArray(data) ? data : data[type] || [];

      if (items.length === 0) {
        throw new Error(`No ${type} found in JSON data`);
      }

      switch (type) {
        case 'agents':
          await this.agentService.bulkImportAgents(items);
          break;
        case 'wEngines':
          await this.wEngineService.bulkImportWEngines(items);
          break;
        case 'discs':
          await this.db.bulkAddDiscs(items);
          break;
      }

      return items.length;
    } catch (error) {
      console.error(`Error importing ${type}:`, error);
      throw error;
    }
  }

  /**
   * Import REFERENCE DATA from individual JSON files in assets/data/character/, weapon/, and equipment/
   * This is the preferred method as it loads complete data with accurate stats
   */
  async importReferenceDataFromIndividualFiles(): Promise<{ agents: number, wEngines: number, discSets: number }> {
    console.log('Starting import from individual JSON files...');

    try {
      // Load the index files to get IDs
      const agentsData = await firstValueFrom(this.http.get<any>(versionedUrl('assets/data/agents.json')));
      const wEnginesIndex = await firstValueFrom(this.http.get<any>(versionedUrl('assets/data/wengines.json')));

      // Handle both array and object formats for agents
      let agentIds: string[];
      let agentsIndex: any;

      if (Array.isArray(agentsData)) {
        // Array format: extract IDs from the 'id' field
        agentIds = agentsData.map(agent => String(agent.id));
        // Create an index object for backward compatibility
        agentsIndex = {};
        agentsData.forEach(agent => {
          agentsIndex[String(agent.id)] = agent;
        });
      } else {
        // Object format: use keys directly
        agentIds = Object.keys(agentsData);
        agentsIndex = agentsData;
      }

      const wEngineIds = Object.keys(wEnginesIndex);

      console.log(`Found ${agentIds.length} agents, ${wEngineIds.length} W-Engines, and ${DISC_SET_EQUIPMENT_IDS.length} disc sets`);

      // Transform all agents directly from agents.json (now includes Icon field)
      const agentPromises = agentIds.map(async (id) => {
        return this.transformer.transformAgentWithDetailedStats(id, agentsIndex[id]);
      });

      // Load W-Engines from wengines.json (already has correct level 60 stats and Effect.Properties)
      const wEnginePromises = wEngineIds.map(async (id) => {
        // Use wEnginesIndex directly - it has the correct level 60 data
        const transformed = this.transformer.transformWEngines({ [id]: wEnginesIndex[id] });
        return transformed[0]; // transformWEngines returns an array
      });

      // Load all disc set files
      const discSetPromises = DISC_SET_EQUIPMENT_IDS.map(async (id) => {
        try {
          const discSetData = await firstValueFrom(
            this.http.get<any>(versionedUrl(`assets/data/equipment/${id}.json`))
          );
          // Transform disc set data
          const transformed = this.transformer.transformDiscSets({ [id]: discSetData });
          return transformed[0];
        } catch (error) {
          console.warn(`Failed to load disc set ${id}`);
          return null;
        }
      });

      // Wait for all loads to complete
      const agents = (await Promise.all(agentPromises)).filter(a => a !== null) as Agent[];
      const wEngines = (await Promise.all(wEnginePromises)).filter(w => w !== null) as WEngine[];
      const discSets = (await Promise.all(discSetPromises)).filter(d => d !== null);

      console.log(`Transformed ${agents.length} agents, ${wEngines.length} W-Engines, and ${discSets.length} disc sets`);

      // Import into database
      await this.agentService.bulkImportAgents(agents);
      await this.wEngineService.bulkImportWEngines(wEngines);

      // Store disc sets in IndexedDB
      await this.db.bulkAddDiscSets(discSets);
      // Reload disc sets into the service cache
      await this.discSetService.reloadDiscSets();

      // Save the current app version so we know when data needs to be reloaded
      await this.db.setStoredDataVersion(this.db.getCurrentAppVersion());

      console.log(`Successfully imported all reference data from individual files (version ${this.db.getCurrentAppVersion()})`);

      return {
        agents: agents.length,
        wEngines: wEngines.length,
        discSets: discSets.length
      };
    } catch (error) {
      console.error('Error importing from individual files:', error);
      throw error;
    }
  }

  /**
   * Export agents to JSON
   */
  async exportAgents(): Promise<string> {
    const agents = await this.db.getAllAgents();
    return JSON.stringify(agents, null, 2);
  }

  /**
   * Export W-Engines to JSON
   */
  async exportWEngines(): Promise<string> {
    const wEngines = await this.db.getAllWEngines();
    return JSON.stringify(wEngines, null, 2);
  }

  /**
   * Export discs to JSON
   */
  async exportDiscs(): Promise<string> {
    const discs = await this.db.getAllDiscs();
    return JSON.stringify(discs, null, 2);
  }

  /**
   * Export all data to JSON
   */
  async exportAllData(): Promise<string> {
    const [agents, wEngines, discs] = await Promise.all([
      this.db.getAllAgents(),
      this.db.getAllWEngines(),
      this.db.getAllDiscs()
    ]);

    return JSON.stringify({
      agents,
      wEngines,
      discs
    }, null, 2);
  }

  /**
   * Clear only USER DATA (keeps reference data intact)
   */
  async clearUserData(): Promise<void> {
    await this.db.clearUserData();
    await this.buildService.clearAllBuilds();
    console.log('User data (discs and builds) cleared');
  }

  /**
   * Clear only REFERENCE DATA (keeps user data intact)
   */
  async clearReferenceData(): Promise<void> {
    await this.db.clearReferenceData();
    console.log('Reference data cleared from IndexedDB');
  }

  /**
   * Clear ALL data from IndexedDB (both reference and user data)
   */
  async clearAllData(): Promise<void> {
    await this.db.clearAllData();
    await this.buildService.clearAllBuilds();
    console.log('All data cleared from IndexedDB and localStorage');
  }

  /**
   * Check if reference data is already loaded
   */
  async hasReferenceData(): Promise<boolean> {
    return await this.db.hasReferenceData();
  }

  /**
   * Check if data needs to be reloaded due to version mismatch
   * This returns true if the app version changed since data was last loaded
   */
  async needsDataReload(): Promise<boolean> {
    return await this.db.needsDataReload();
  }
}
