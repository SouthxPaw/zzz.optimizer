// services/agent.service.ts
import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';
import { Agent } from '../models/agent.model';
import { DbService } from './db.service';

@Injectable({
  providedIn: 'root'
})
export class AgentService {
  private agentsSubject = new BehaviorSubject<Agent[]>([]);
  public agents$: Observable<Agent[]> = this.agentsSubject.asObservable();

  private selectedAgentSubject = new BehaviorSubject<Agent | null>(null);
  public selectedAgent$: Observable<Agent | null> = this.selectedAgentSubject.asObservable();

  constructor(
    private db: DbService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.loadAgents();
  }

  private async loadAgents() {
    // Only run in browser
    if (!isPlatformBrowser(this.platformId)) {
      this.agentsSubject.next([]);
      return;
    }

    try {
      const agents = await this.db.getAllAgents();
      this.agentsSubject.next(agents);
      console.log(`Loaded ${agents.length} agents from IndexedDB`);

      // Select first agent by default if available
      if (agents.length > 0) {
        this.selectAgent(agents[0]);
      }
    } catch (error) {
      console.error('Error loading agents from IndexedDB:', error);
      this.agentsSubject.next([]);
    }
  }

  getAgents(): Agent[] {
    return this.agentsSubject.value;
  }

  getAgentById(id: string): Agent | undefined {
    return this.agentsSubject.value.find(a => a.id === id);
  }

  selectAgent(agent: Agent | null): void {
    this.selectedAgentSubject.next(agent);
  }

  getSelectedAgent(): Agent | null {
    return this.selectedAgentSubject.value;
  }

  // Legacy filter methods removed - filtering is now handled in components

  // CRUD operations for agents
  async addAgent(agent: Agent): Promise<void> {
    try {
      await this.db.addAgent(agent);
      await this.loadAgents(); // Refresh the list
    } catch (error) {
      console.error('Error adding agent:', error);
      throw error;
    }
  }

  async updateAgent(id: string, changes: Partial<Agent>): Promise<void> {
    try {
      await this.db.updateAgent(id, changes);
      await this.loadAgents(); // Refresh the list
    } catch (error) {
      console.error('Error updating agent:', error);
      throw error;
    }
  }

  async deleteAgent(id: string): Promise<void> {
    try {
      await this.db.deleteAgent(id);
      await this.loadAgents(); // Refresh the list

      // Deselect if the deleted agent was selected
      if (this.selectedAgentSubject.value?.id === id) {
        this.selectAgent(null);
      }
    } catch (error) {
      console.error('Error deleting agent:', error);
      throw error;
    }
  }

  async bulkImportAgents(agents: Agent[]): Promise<void> {
    try {
      await this.db.bulkAddAgents(agents);
      await this.loadAgents(); // Refresh the list
    } catch (error) {
      console.error('Error bulk importing agents:', error);
      throw error;
    }
  }

  async clearAllAgents(): Promise<void> {
    try {
      await this.db.agents.clear();
      await this.loadAgents(); // Refresh the list
      this.selectAgent(null);
    } catch (error) {
      console.error('Error clearing agents:', error);
      throw error;
    }
  }
}
