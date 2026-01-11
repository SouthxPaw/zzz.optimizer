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
  transformSingleAgent(id: string, rawAgent: any): Agent | null {
    // Support both formats: agents.json (lowercase) and character/{id}.json (uppercase/EN)
    const name = rawAgent.name || rawAgent.EN;
    const element = rawAgent.element?.id || rawAgent.element;
    const specialty = rawAgent.specialty?.id || rawAgent.type;
    const rarity = rawAgent.rarity || (rawAgent.rank >= 4 ? 'S' : 'A');

    // Skip if missing required fields
    if (!name || (!element && element !== 0) || (!specialty && specialty !== 0)) {
      return null;
    }

    // Get level 60 stats
    const lvl60Stats = this.extractLevel60Stats(rawAgent);
    if (!lvl60Stats) {
      console.warn(`No level 60 stats found for agent ${name}`);
      return null;
    }

    // Map element and specialty
    const mappedElement = this.mappingService.getElement(element);
    const mappedSpecialty = this.mappingService.getSpecialty(specialty);

    return {
      id: id,
      name: name,
      rarity: rarity === 'S' ? 'S' : 'A',
      element: mappedElement,
      specialty: mappedSpecialty,
      lvl60Stats: lvl60Stats
    };
  }

  /**
   * Extract level 60 base stats from raw agent data
   */
  private extractLevel60Stats(rawAgent: any): BaseStats | null {
    // PREFERRED: Use pre-calculated lvl60_stats from agents.json if available
    if (rawAgent.lvl60_stats) {
      const lvl60 = rawAgent.lvl60_stats;
      const stats = rawAgent.stats || rawAgent.Stats;

      return {
        hp: Math.round(lvl60.HpMax || 0),
        hppercent: 0,
        atk: Math.round(lvl60.Attack || 0),
        atkpercent: 0,
        def: Math.round(lvl60.Defence || 0),
        defpercent: 0,
        impact: Math.round(lvl60.BreakStun || stats?.BreakStun || 0),
        anomalyMastery: Math.round(stats?.ElementAbnormalPower || 0),
        critRate: (lvl60.Crit || 500) / 100,
        critDmg: (lvl60.CritDamage || 5000) / 100,
        anomalyProficiency: Math.round(lvl60.ElementMystery || stats?.ElementMystery || 0),
        penRatio: (lvl60.PenRate || 0) / 100,
        energyRegen: (lvl60.SpBarPoint || 120) / 10
      };
    }

    // FALLBACK: Calculate from Stats and Level fields (character/{id}.json format)
    const stats = rawAgent.Stats;

    if (stats && rawAgent.Level) {
      // Full stat data available - use actual values
      const level6 = rawAgent.Level?.['6'];

      const baseHp = stats.HpMax || 0;
      const baseAtk = stats.Attack || 0;
      const baseDef = stats.Defence || 0;

      const critRate = (stats.Crit || 500) / 100;
      const critDmg = (stats.CritDamage || 5000) / 100;
      let impact = stats.BreakStun || 0;
      const anomalyMastery = stats.ElementAbnormalPower || 0;
      const anomalyProficiency = stats.ElementMystery || 0;
      const penRatio = (stats.PenRate || stats.PenDelta || 0) / 100;
      const energyRegen = (stats.SpRecover || stats.SpBarPoint || 120) / 100;

      // Add ExtraLevel bonuses (ascension bonuses)
      // ExtraLevel contains cumulative totals at each phase, so we only need the FINAL value (phase 6)
      let extraAtk = 0;
      let extraImpact = 0;
      if (rawAgent.ExtraLevel) {
        // Get the final ascension phase (level 6)
        const finalPhase = rawAgent.ExtraLevel['6'];
        if (finalPhase && finalPhase.Extra) {
          const extra = finalPhase.Extra;
          // 12101 is the property code for Base ATK
          if (extra['12101']) {
            extraAtk = extra['12101'].Value || 0;
          }
          // 12201 is the property code for Impact
          if (extra['12201']) {
            extraImpact = extra['12201'].Value || 0;
          }
        }
      }

      // Add the final ExtraLevel bonuses
      impact += extraImpact;

      // Calculate final stats at level 60
      // The formula is: (baseStat + level6Stat) × rarity_multiplier + extraBonus
      // A-rank (Rarity 3): 2.2x multiplier
      // S-rank (Rarity 4+): 2.32x multiplier
      const rarity = rawAgent.Rarity || 3;
      const statMultiplier = rarity >= 4 ? 2.32 : 2.2;

      const finalHp = Math.round((baseHp + (level6?.HpMax || 0)) * statMultiplier);
      const finalAtk = Math.round((baseAtk + (level6?.Attack || 0)) * statMultiplier + extraAtk);
      const finalDef = Math.round((baseDef + (level6?.Defence || 0)) * statMultiplier);

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
   * Supports both old format (EN, type, rank) and new format (Name, WeaponType, Rarity, BaseProperty, RandProperty)
   */
  private transformSingleWEngine(id: string, rawWEngine: any): WEngine | null {
    // Check if this is new format (individual weapon/*.json files)
    const isNewFormat = rawWEngine.Name && rawWEngine.WeaponType && rawWEngine.BaseProperty;

    if (isNewFormat) {
      return this.transformNewFormatWEngine(id, rawWEngine);
    }

    // Old format (wengines.json)
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
   * Transform new format W-Engine (from weapon/{id}.json files)
   */
  private transformNewFormatWEngine(id: string, raw: any): WEngine | null {
    // Extract weapon type - it's an object like { "1": "Attack" }
    const weaponTypeObj = raw.WeaponType || {};
    const weaponTypeKey = Object.keys(weaponTypeObj)[0];
    const weaponTypeValue = weaponTypeObj[weaponTypeKey];

    // Map rarity: 2 = B, 3 = A, 4+ = S
    const rarity = this.mappingService.getRarity(raw.Rarity || 2);

    // Map specialty from weapon type
    const specialty = this.mappingService.getSpecialtyFromName(weaponTypeValue || 'Attack');

    // Extract base ATK from BaseProperty at level 60
    // BaseProperty.Value is base value, need to add Level["60"].Rate
    const baseValue = raw.BaseProperty?.Value || 0;
    const level60 = raw.Level?.['60'];
    const rateMultiplier = level60 ? (level60.Rate / 10000) : 0;
    const baseAtk = Math.round(baseValue * (1 + rateMultiplier));

    // Extract substat from RandProperty
    // RandProperty.Name is like "ATK" or "CRIT Rate"
    // RandProperty.Value is in basis points (e.g., 800 = 8.00%)
    const randProp = raw.RandProperty || {};
    const subStatName = randProp.Name || 'ATK';
    const subStatValue = (randProp.Value || 0) / 100; // Convert from basis points to percentage

    // Map substat name to our StatType
    let subStatType: any = 'ATK%';
    if (subStatName === 'CRIT Rate') {
      subStatType = 'CRIT_Rate';
    } else if (subStatName === 'CRIT DMG') {
      subStatType = 'CRIT_DMG';
    } else if (subStatName.includes('ATK')) {
      subStatType = 'ATK%';
    } else if (subStatName.includes('DEF')) {
      subStatType = 'DEF%';
    } else if (subStatName.includes('HP')) {
      subStatType = 'HP%';
    } else if (subStatName.includes('Anomaly Proficiency')) {
      subStatType = 'Anomaly_Proficiency';
    } else if (subStatName.includes('Impact')) {
      subStatType = 'Impact';
    } else if (subStatName.includes('Energy')) {
      subStatType = 'Energy_Regen';
    } else if (subStatName.includes('PEN')) {
      subStatType = 'Pen_Ratio';
    }

    // Get effect description from Talents (first talent)
    const talents = raw.Talents || {};
    const firstTalent = talents['1'] || {};
    const effectDesc = firstTalent.Desc || raw.Desc || 'No description available';

    return {
      id: id,
      name: raw.Name,
      rarity: rarity,
      specialty: specialty,
      baseAtk: baseAtk,
      subStat: {
        type: subStatType,
        value: subStatValue
      },
      effect: {
        name: firstTalent.Name || 'Effect',
        description: effectDesc
      },
      signature: raw.CharacterId ? String(raw.CharacterId) : undefined
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
   * Transform disc sets from equipment JSON files
   */
  transformDiscSets(rawData: any): any[] {
    const discSets: any[] = [];

    for (const [id, rawSet] of Object.entries(rawData)) {
      try {
        const discSet = this.transformSingleDiscSet(id, rawSet as any);
        if (discSet) {
          discSets.push(discSet);
        }
      } catch (error) {
        console.warn(`Failed to transform disc set ${id}:`, error);
      }
    }

    return discSets;
  }

  /**
   * Transform a single disc set from equipment JSON
   */
  private transformSingleDiscSet(id: string, raw: any): any | null {
    if (!raw.Name) {
      return null;
    }

    const bonuses: any[] = [];

    // 2-piece bonus
    if (raw.Desc2) {
      bonuses.push({
        pieces: 2,
        description: raw.Desc2
      });
    }

    // 4-piece bonus
    if (raw.Desc4) {
      bonuses.push({
        pieces: 4,
        description: raw.Desc4
      });
    }

    return {
      id: id,
      name: raw.Name,
      bonuses: bonuses,
      icon: raw.Icon || raw.Icon2
    };
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
