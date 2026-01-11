import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { Agent } from '../models/agent.model';
import { WEngine } from '../models/wengine.model';
import { Disc } from '../models/disc.model';

@Injectable({
  providedIn: 'root'
})
export class DbService extends Dexie {
  agents!: Table<Agent, string>;
  wEngines!: Table<WEngine, string>;
  discs!: Table<Disc, string>;

  constructor() {
    super('ZZZOptimizerDB');

    this.version(1).stores({
      agents: 'id, name, rarity, element, specialty',
      wEngines: 'id, name, rarity, specialty',
      discs: 'uid, slot, set, rarity, equippedBy'
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
    return await this.agents.bulkAdd(agents, { allKeys: true }) as any;
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
    return await this.wEngines.bulkAdd(wEngines, { allKeys: true }) as any;
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

  // Clear all data
  async clearAllData(): Promise<void> {
    await this.agents.clear();
    await this.wEngines.clear();
    await this.discs.clear();
  }
}
