// services/agent.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { Agent, BaseStats, Element, Specialty } from '../models/agent.model';

interface AgentData {
  meta: {
    version: string;
    lastUpdated: string;
    note: string;
  };
  agents: Agent[];
}

@Injectable({
  providedIn: 'root'
})
export class AgentService {
  private agentsSubject = new BehaviorSubject<Agent[]>([]);
  public agents$: Observable<Agent[]> = this.agentsSubject.asObservable();

  private selectedAgentSubject = new BehaviorSubject<Agent | null>(null);
  public selectedAgent$: Observable<Agent | null> = this.selectedAgentSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadAgents();
  }

  private async loadAgents() {
    try {
      const data = await firstValueFrom(
        this.http.get<AgentData>('assets/data/agents.json')
      );

      this.agentsSubject.next(data.agents);
      console.log(`Loaded ${data.agents.length} agents`);

      // Select first agent by default
      if (data.agents.length > 0) {
        this.selectAgent(data.agents[0]);
      }
    } catch (error) {
      console.error('Error loading agents:', error);
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

  filterAgentsByElement(element: Element): Agent[] {
    return this.agentsSubject.value.filter(a => a.element === element);
  }

  filterAgentsBySpecialty(specialty: Specialty): Agent[] {
    return this.agentsSubject.value.filter(a => a.specialty === specialty);
  }

  filterAgentsByRarity(rarity: 'A' | 'S'): Agent[] {
    return this.agentsSubject.value.filter(a => a.rarity === rarity);
  }
}
