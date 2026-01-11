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
   * Import agents from a JSON file in the assets folder
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
   * Import W-Engines from a JSON file in the assets folder
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
   * Import discs from a JSON file in the assets folder
   * @param filePath Path to JSON file (e.g., 'assets/data/discs.json')
   */
  async importDiscsFromFile(filePath: string = 'assets/data/discs.json'): Promise<number> {
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
   * Import all data from the assets folder
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
   * Clear all data from IndexedDB
   */
  async clearAllData(): Promise<void> {
    await this.db.clearAllData();
    console.log('All data cleared from IndexedDB');
  }
}
