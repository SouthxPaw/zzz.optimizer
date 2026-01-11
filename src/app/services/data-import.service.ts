import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DbService } from './db.service';
import { AgentService } from './agent.service';
import { WEngineService } from './wengine.service';
import { DataTransformerService } from './data-transformer.service';
import { Agent } from '../models/agent.model';
import { WEngine } from '../models/wengine.model';
import { Disc } from '../models/disc.model';

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
    private transformer: DataTransformerService
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
      // Ensure path starts with / to make it absolute
      const absolutePath = filePath.startsWith('/') ? filePath : `/${filePath}`;
      console.log(`Attempting to load agents from: ${absolutePath}`);
      const rawData = await firstValueFrom(this.http.get<any>(absolutePath));

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
      // Ensure path starts with / to make it absolute
      const absolutePath = filePath.startsWith('/') ? filePath : `/${filePath}`;
      const rawData = await firstValueFrom(this.http.get<any>(absolutePath));

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
      // Ensure path starts with / to make it absolute
      const absolutePath = filePath.startsWith('/') ? filePath : `/${filePath}`;
      const data = await firstValueFrom(this.http.get<any>(absolutePath));

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
      const agentsIndex = await firstValueFrom(this.http.get<any>('/assets/data/agents.json'));
      const wEnginesIndex = await firstValueFrom(this.http.get<any>('/assets/data/wengines.json'));

      const agentIds = Object.keys(agentsIndex);
      const wEngineIds = Object.keys(wEnginesIndex);

      // Disc set IDs from equipment folder (31000-33600)
      const discSetIds = ['31000', '31100', '31200', '31300', '31400', '31500', '31600', '31800', '31900',
                          '32200', '32300', '32400', '32500', '32600', '32700', '32800', '32900',
                          '33000', '33100', '33200', '33300', '33400', '33500', '33600'];

      console.log(`Found ${agentIds.length} agents, ${wEngineIds.length} W-Engines, and ${discSetIds.length} disc sets`);

      // Load all agent detail files
      const agentPromises = agentIds.map(async (id) => {
        try {
          const detailData = await firstValueFrom(
            this.http.get<any>(`/assets/data/character/${id}.json`)
          );
          // Transform using the detailed data
          return this.transformer.transformAgentWithDetailedStats(id, agentsIndex[id], detailData);
        } catch (error) {
          console.warn(`Failed to load detailed data for agent ${id}, using basic transform`);
          return this.transformer.transformSingleAgent(id, agentsIndex[id]);
        }
      });

      // Load all weapon detail files
      const wEnginePromises = wEngineIds.map(async (id) => {
        try {
          const weaponData = await firstValueFrom(
            this.http.get<any>(`/assets/data/weapon/${id}.json`)
          );
          // Transform using the detailed weapon data (new format)
          const transformed = this.transformer.transformWEngines({ [id]: weaponData });
          return transformed[0]; // transformWEngines returns an array
        } catch (error) {
          console.warn(`Failed to load weapon data for ${id}, using basic transform`);
          const transformed = this.transformer.transformWEngines({ [id]: wEnginesIndex[id] });
          return transformed[0];
        }
      });

      // Load all disc set files
      const discSetPromises = discSetIds.map(async (id) => {
        try {
          const discSetData = await firstValueFrom(
            this.http.get<any>(`/assets/data/equipment/${id}.json`)
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

      console.log('Successfully imported all reference data from individual files');

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
    console.log('User data cleared from IndexedDB');
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
    console.log('All data cleared from IndexedDB');
  }

  /**
   * Check if reference data is already loaded
   */
  async hasReferenceData(): Promise<boolean> {
    return await this.db.hasReferenceData();
  }
}
