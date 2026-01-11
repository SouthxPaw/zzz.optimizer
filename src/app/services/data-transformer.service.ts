import { Injectable } from '@angular/core';
import { Agent, BaseStats } from '../models/agent.model';
import { WEngine } from '../models/wengine.model';
import { DataMappingService } from './data-mapping.service';

/**
 * Service to transform raw game data JSON into app-compatible format
 */
@Injectable({
  providedIn: 'root'
})
export class DataTransformerService {

  constructor(private mappingService: DataMappingService) {}

  /**
   * Transform raw agents JSON to Agent[] format
   */
  transformAgents(rawData: any): Agent[] {
    const agents: Agent[] = [];

    for (const [id, rawAgent] of Object.entries(rawData)) {
      try {
        const agent = this.transformSingleAgent(id, rawAgent as any);
        if (agent) {
          agents.push(agent);
        }
      } catch (error) {
        console.warn(`Failed to transform agent ${id}:`, error);
      }
    }

    return agents;
  }

  /**
   * Transform a single raw agent to Agent format
   */
  private transformSingleAgent(id: string, rawAgent: any): Agent | null {
    // Skip if missing required fields
    if (!rawAgent.EN || !rawAgent.element || !rawAgent.type) {
      return null;
    }

    // Get level 60 stats (Level "6" in the data)
    const lvl60Stats = this.extractLevel60Stats(rawAgent);
    if (!lvl60Stats) {
      console.warn(`No level 60 stats found for agent ${rawAgent.EN}`);
      return null;
    }

    // Map rarity: rank 3 = A-rank, rank 4+ = S-rank
    const rarity: 'A' | 'S' = this.mappingService.getRarity(rawAgent.rank) as 'A' | 'S';

    // Map element
    const element = this.mappingService.getElement(rawAgent.element);

    // Map specialty
    const specialty = this.mappingService.getSpecialty(rawAgent.type);

    return {
      id: id,
      name: rawAgent.EN,
      rarity: rarity,
      element: element,
      specialty: specialty,
      lvl60Stats: lvl60Stats
    };
  }

  /**
   * Extract level 60 base stats from raw agent data
   */
  private extractLevel60Stats(rawAgent: any): BaseStats | null {
    // Check if Stats field exists (full stat data)
    const stats = rawAgent.Stats;

    if (stats && rawAgent.Level) {
      // Full stat data available - use actual values
      const level6 = rawAgent.Level?.['6'];

      const baseHp = stats.HpMax || 0;
      const baseAtk = stats.Attack || 0;
      const baseDef = stats.Defence || 0;

      const finalHp = baseHp + (level6?.HpMax || 0);
      const finalDef = baseDef + (level6?.Defence || 0);

      const critRate = (stats.Crit || 500) / 100;
      const critDmg = (stats.CritDamage || 5000) / 100;
      let impact = stats.BreakStun || 0;
      const anomalyMastery = stats.ElementAbnormalPower || 0;
      const anomalyProficiency = stats.ElementMystery || 0;
      const penRatio = (stats.PenRate || stats.PenDelta || 0) / 100;
      const energyRegen = (stats.SpRecover || stats.SpBarPoint || 120) / 100;

      // Add ExtraLevel bonuses (ascension bonuses)
      // These add additional stats at each ascension phase
      let extraAtk = 0;
      if (rawAgent.ExtraLevel) {
        for (const [, levelData] of Object.entries(rawAgent.ExtraLevel as any)) {
          const extra = (levelData as any).Extra;
          if (extra) {
            // 12101 is the property code for Base ATK
            if (extra['12101']) {
              extraAtk += extra['12101'].Value || 0;
            }
            // 12201 is the property code for Impact
            if (extra['12201']) {
              impact += extra['12201'].Value || 0;
            }
          }
        }
      }

      // Calculate final ATK including level growth and ascension bonuses
      const finalAtk = baseAtk + (level6?.Attack || 0) + extraAtk;

      return {
        hp: Math.round(finalHp),
        hppercent: 0,
        atk: Math.round(finalAtk),
        atkpercent: 0,
        def: Math.round(finalDef),
        defpercent: 0,
        impact: Math.round(impact),
        anomalyMastery: Math.round(anomalyMastery),
        critRate: critRate,
        critDmg: critDmg,
        anomalyProficiency: Math.round(anomalyProficiency),
        penRatio: penRatio,
        energyRegen: energyRegen
      };
    }

    // No Stats field - generate placeholder stats based on rarity and specialty
    console.log(`Using placeholder stats for ${rawAgent.EN} (Stats field not found)`);

    const rarity = rawAgent.rank >= 4 ? 'S' : 'A';
    const specialty = rawAgent.type;

    // Base stats vary by rarity
    const baseHP = rarity === 'S' ? 8000 : 7000;
    const baseATK = rarity === 'S' ? 3200 : 2800;
    const baseDEF = rarity === 'S' ? 650 : 580;

    return {
      hp: baseHP,
      hppercent: 0,
      atk: baseATK,
      atkpercent: 0,
      def: baseDEF,
      defpercent: 0,
      impact: this.getDefaultImpact(specialty),
      anomalyMastery: this.getDefaultAnomalyMastery(specialty),
      critRate: 5,
      critDmg: 50,
      anomalyProficiency: 0,
      penRatio: 0,
      energyRegen: 1.2
    };
  }

  /**
   * Estimate base stat from growth value
   */
  private estimateBaseStat(growthValue: number, type: number, statType: 'hp' | 'atk' | 'def'): number {
    // The growth values represent stat increases from level 1 to 60
    // Typical base stats for ZZZ characters:
    // HP: 5000-6000 base + growth
    // ATK: 2500-3500 base + growth
    // DEF: 500-700 base + growth

    if (statType === 'hp') {
      return 5500; // Average base HP
    } else if (statType === 'atk') {
      return 2800; // Average base ATK
    } else {
      return 600; // Average base DEF
    }
  }

  /**
   * Get default Impact based on specialty
   */
  private getDefaultImpact(type: number): number {
    // Stun characters have higher Impact
    if (type === 2) return 120;
    // Attack characters have medium-high Impact
    if (type === 1) return 96;
    // Others have lower Impact
    return 88;
  }

  /**
   * Get default Anomaly Mastery based on specialty
   */
  private getDefaultAnomalyMastery(type: number): number {
    // Anomaly characters have higher Anomaly Mastery
    if (type === 3 || type === 6) return 115;
    // Others have standard Anomaly Mastery
    return 92;
  }

  /**
   * Transform raw W-Engines JSON to WEngine[] format
   */
  transformWEngines(rawData: any): WEngine[] {
    const wEngines: WEngine[] = [];

    for (const [id, rawWEngine] of Object.entries(rawData)) {
      try {
        const wEngine = this.transformSingleWEngine(id, rawWEngine as any);
        if (wEngine) {
          wEngines.push(wEngine);
        }
      } catch (error) {
        console.warn(`Failed to transform W-Engine ${id}:`, error);
      }
    }

    return wEngines;
  }

  /**
   * Transform a single raw W-Engine to WEngine format
   */
  private transformSingleWEngine(id: string, rawWEngine: any): WEngine | null {
    if (!rawWEngine.EN || !rawWEngine.type) {
      return null;
    }

    // Map rarity: 2 = B, 3 = A, 4+ = S
    const rarity = this.mappingService.getRarity(rawWEngine.rank);

    // Map specialty
    const specialty = this.mappingService.getSpecialty(rawWEngine.type);

    // Estimate base ATK based on rarity
    let baseAtk: number;
    if (rarity === 'S') {
      baseAtk = 713; // S-rank W-Engines
    } else if (rarity === 'A') {
      baseAtk = 594; // A-rank W-Engines
    } else {
      baseAtk = 475; // B-rank W-Engines
    }

    return {
      id: id,
      name: rawWEngine.EN,
      rarity: rarity,
      specialty: specialty,
      baseAtk: baseAtk,
      subStat: {
        type: 'ATK%', // Default, would need more data to determine actual substat
        value: rarity === 'S' ? 30 : rarity === 'A' ? 25 : 20
      },
      effect: {
        name: 'Effect',
        description: rawWEngine.desc || 'No description available'
      }
    };
  }

  /**
   * Transform a single agent with enhanced stats from detailed character JSON
   * This method merges data from agents.json with character/{id}.json for accurate stats
   */
  transformAgentWithDetailedStats(id: string, basicAgent: any, detailedData: any): Agent {
    // Use detailed stats if available, otherwise fall back to extractLevel60Stats
    const lvl60Stats = this.extractLevel60Stats(detailedData) || this.extractLevel60Stats(basicAgent);

    if (!lvl60Stats) {
      throw new Error(`Failed to extract stats for agent ${id}`);
    }

    const rarity = this.mappingService.getRarity(basicAgent.rank) as 'A' | 'S';
    const element = this.mappingService.getElement(basicAgent.element);
    const specialty = this.mappingService.getSpecialty(basicAgent.type);

    return {
      id: id,
      name: basicAgent.EN || detailedData.Name || 'Unknown',
      rarity: rarity,
      element: element,
      specialty: specialty,
      lvl60Stats: lvl60Stats
    };
  }

  /**
   * Get agent image path helper
   */
  getAgentImagePath(agentId: string): string {
    return this.mappingService.getAgentImagePath(agentId);
  }

  /**
   * Get W-Engine image path helper
   */
  getWEngineImagePath(icon: string): string {
    return this.mappingService.getWEngineImagePath(icon);
  }

  /**
   * Create a sample properly formatted agent for reference
   */
  createSampleAgent(): Agent {
    return {
      id: 'ellen-joe',
      name: 'Ellen Joe',
      rarity: 'S',
      element: 'Ice',
      specialty: 'Attack',
      lvl60Stats: {
        hp: 8367,
        hppercent: 0,
        atk: 3373,
        atkpercent: 0,
        def: 686,
        defpercent: 0,
        impact: 96,
        anomalyMastery: 92,
        critRate: 5,
        critDmg: 50,
        anomalyProficiency: 0,
        penRatio: 0,
        energyRegen: 0
      }
    };
  }
}
