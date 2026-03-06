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

    // Handle both array format (agents.json) and object format (legacy)
    if (Array.isArray(rawData)) {
      // Array format: agents.json has array of agent objects
      for (const rawAgent of rawData) {
        try {
          const id = String(rawAgent.id);
          const agent = this.transformSingleAgent(id, rawAgent);
          if (agent) {
            agents.push(agent);
          }
        } catch (error) {
          console.warn(`Failed to transform agent ${rawAgent.id}:`, error);
        }
      }
    } else {
      // Object format: legacy format with numeric keys
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

    // Check for HP ascension bonus (property 11102) FIRST
    let hasHPAscension = false;
    let hpAscensionPercent = 0;

    // Check extra_ascension first (agents.json format)
    if (rawAgent.extra_ascension) {
      const level60Phase = rawAgent.extra_ascension.find((phase: any) => phase.max_level === 60);
      if (level60Phase && level60Phase.props) {
        const hpProp = level60Phase.props.find((prop: any) => prop.id === 11102);
        if (hpProp) {
          hasHPAscension = true;
          hpAscensionPercent = hpProp.value / 100; // 1800 -> 18
        }
      }
    }
    // Fallback to ExtraLevel (character/{id}.json format)
    else if (rawAgent.ExtraLevel) {
      const finalPhase = rawAgent.ExtraLevel['6'];
      if (finalPhase && finalPhase.Extra && finalPhase.Extra['11102']) {
        hasHPAscension = true;
        hpAscensionPercent = finalPhase.Extra['11102'].Value / 100; // 1800 -> 18
      }
    }

    // Get level 60 stats (passing HP ascension info)
    const lvl60Stats = this.extractLevel60Stats(rawAgent, hasHPAscension, hpAscensionPercent);
    if (!lvl60Stats) {
      console.warn(`No level 60 stats found for agent ${name}`);
      return null;
    }

    // Map element and specialty
    const mappedElement = this.mappingService.getElement(element);
    const mappedSpecialty = this.mappingService.getSpecialty(specialty);

    // Extract icon - prefer Icon field if available, fallback to normalized name
    let icon: string;
    if (rawAgent.Icon && !rawAgent.Icon.startsWith('IconRole')) {
      // Icon field exists and is not the old IconRole format - use it directly
      const iconFileName = rawAgent.Icon.endsWith('.webp') ? rawAgent.Icon : `${rawAgent.Icon}.webp`;
      icon = `assets/data/images/agents/${iconFileName}`;
    } else {
      // Fallback: normalize agent name to match icon filename format
      const iconFileName = this.normalizeAgentNameForIcon(name);
      icon = `assets/data/images/agents/${iconFileName}.webp`;
    }

    // Map element icon
    const elementIcon = `assets/data/images/elements/Icon${mappedElement}.webp`;

    // Check for special element icons for specific agents
    let specialElementIcon: string | undefined;
    const agentIdStr = id.toString();
    if (agentIdStr === '1091') {
      // Miyabi - Frost (Ice variant)
      specialElementIcon = 'Frost';
    } else if (agentIdStr === '1371') {
      // Yi Xuan - AuricInk (Ether variant)
      specialElementIcon = 'AuricInk';
    } else if (agentIdStr === '1431') {
      // Ye Shunguang - HonedEdge (Physical variant)
      specialElementIcon = 'HonedEdge';
    }

    // Map specialty icon
    const specialtyIcon = `assets/data/images/roles/Icon${mappedSpecialty === 'Attack' ? 'AttackType' : mappedSpecialty}.webp`;

    return {
      id: id,
      name: name,
      rarity: rarity === 'S' ? 'S' : 'A',
      element: mappedElement,
      specialty: mappedSpecialty,
      lvl60Stats: lvl60Stats,
      icon: icon,
      elementIcon: elementIcon,
      specialElementIcon: specialElementIcon,
      specialtyIcon: specialtyIcon,
      scoring: rawAgent.scoring, // Include scoring data (buffs, debuffs, dazeBonus)
      hasHPAscension: hasHPAscension ? true : undefined,
      hpAscensionPercent: hasHPAscension ? hpAscensionPercent : undefined
    };
  }

  /**
   * Extract level 60 base stats from raw agent data
   */
  private extractLevel60Stats(rawAgent: any, hasHPAscension: boolean = false, hpAscensionPercent: number = 0): BaseStats | null {
    // PREFERRED: Use pre-calculated lvl60_stats from agents.json if available
    if (rawAgent.lvl60_stats) {
      const lvl60 = rawAgent.lvl60_stats;
      const stats = rawAgent.stats || rawAgent.Stats;

      // For agents with HP ascension, lvl60_stats.HpMax is the pre-ascension base
      // We need to add the ascension bonus to get the naked HP for display
      let displayHP = Math.round(lvl60.HpMax || 0);
      if (hasHPAscension && hpAscensionPercent > 0) {
        displayHP = Math.round(displayHP * (1 + hpAscensionPercent / 100));
      }

      return {
        hp: displayHP,
        hppercent: 0,
        atk: Math.round(lvl60.Attack || 0),
        atkpercent: 0,
        def: Math.round(lvl60.Defence || 0),
        defpercent: 0,
        impact: Math.round(lvl60.BreakStun || stats?.BreakStun || 0),
        anomalyMastery: Math.round(lvl60.ElementAbnormalPower || stats?.ElementAbnormalPower || 0),
        anomalyMasteryPercent: 0,
        critRate: (lvl60.Crit || 500) / 100,
        critDmg: (lvl60.CritDamage || 5000) / 100,
        anomalyProficiency: Math.round(lvl60.ElementMystery || stats?.ElementMystery || 0),
        pen: Math.round(lvl60.PenDelta || 0),
        penRatio: (lvl60.PenRate || 0) / 100,
        energyRegen: (lvl60.SpBarPoint || 12) / 10,  // 12 / 10 = 1.2
        energyRegenPercent: 0
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
        anomalyMasteryPercent: 0,
        critRate: critRate,
        critDmg: critDmg,
        anomalyProficiency: Math.round(anomalyProficiency),
        pen: Math.round(stats.PenDelta || 0),
        penRatio: penRatio,
        energyRegen: energyRegen,
        energyRegenPercent: 0
      };
    }

    // No Stats field - generate placeholder stats based on rarity and specialty
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
      anomalyMasteryPercent: 0,
      critRate: 5,
      critDmg: 50,
      anomalyProficiency: 0,
      pen: 0,
      penRatio: 0,
      energyRegen: 1.2,
      energyRegenPercent: 0
    };
  }

  /**
   * Normalize agent name to match icon filename format
   * Examples:
   * - "Zhu Yuan" -> "ZhuYuan"
   * - "Qingyi" -> "QingYi"
   * - "Soldier 11" -> "Soldier11"
   * - "Astra Yao" -> "AstraYao"
   * - "Yixuan" -> "YiXuan"
   * - "Pan Yinhu" -> "PanYinhu"
   * - "Ye Shunguang" -> "YeShunguang"
   * - "Ju Fufu" -> "JuFufu"
   * - "Soldier 0 - Anby" -> "Soldier0Anby"
   * - "Orphie & Magus" -> "Orphie"
   * - "Seed" -> "SEED"
   */
  private normalizeAgentNameForIcon(name: string): string {
    // Handle special cases first
    const specialCases: { [key: string]: string } = {
      'Qingyi': 'QingYi',
      'Yixuan': 'YiXuan',
      'Seed': 'SEED',
      'Orphie & Magus': 'Orphie'
    };

    // Check if this is a special case (case-insensitive check)
    const specialKey = Object.keys(specialCases).find(key => key.toLowerCase() === name.toLowerCase());
    if (specialKey) {
      return specialCases[specialKey];
    }

    // Default normalization: remove spaces, hyphens, and ampersands
    return name
      .replace(/\s*&\s*.*$/, '') // Remove " & Magus" or similar patterns
      .replace(/\s+/g, '')        // Remove all spaces
      .replace(/-/g, '');          // Remove hyphens
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

    // Map rarity from Rarity field if available, otherwise use rank
    const rarity = rawWEngine.Rarity
      ? this.mappingService.getRarity(rawWEngine.Rarity)
      : this.mappingService.getRarity(rawWEngine.rank);

    // Map specialty from WeaponType if available
    let specialty: 'Attack' | 'Stun' | 'Anomaly' | 'Support' | 'Defense';
    if (rawWEngine.WeaponType) {
      const weaponTypeObj = rawWEngine.WeaponType;
      const weaponTypeValue = Object.values(weaponTypeObj)[0] as string;
      specialty = this.mappingService.getSpecialtyFromName(weaponTypeValue || 'Attack') as any;
    } else {
      specialty = this.mappingService.getSpecialty(rawWEngine.type) as any;
    }

    // Extract base ATK from BaseProperty (already at level 60)
    const baseAtk = rawWEngine.BaseProperty?.Value || (rarity === 'S' ? 713 : rarity === 'A' ? 594 : 475);

    // Extract substat from RandProperty (already at level 60)
    const randProp = rawWEngine.RandProperty || {};
    const subStatName = randProp.Name || 'ATK';
    // Convert from basis points to percentage ONLY for percentage stats
    // Check Format field: if it contains '%', it's a percentage stat that needs division
    const format = randProp.Format || '';
    const isPercentageStat = format.includes('%');
    const subStatValue = isPercentageStat ? (randProp.Value || 0) / 100 : (randProp.Value || 0);

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
    } else if (subStatName.includes('Anomaly Mastery')) {
      subStatType = 'Anomaly_Mastery';
    } else if (subStatName.includes('Anomaly Proficiency')) {
      subStatType = 'Anomaly_Proficiency';
    } else if (subStatName.includes('Impact')) {
      subStatType = 'Impact';
    } else if (subStatName.includes('Energy')) {
      subStatType = 'Energy_Regen';
    } else if (subStatName.includes('PEN')) {
      subStatType = 'PEN_Ratio';
    }

    // Get effect description from Effect field
    const effectDesc = rawWEngine.Effect?.Desc || rawWEngine.desc || 'No description available';

    // Extract refinement properties from Effect.Properties
    const refinementProperties = this.extractRefinementProperties(rawWEngine.Effect?.Properties || []);

    // Map icon path from Icon field or construct from rarity/id
    let icon: string;
    if (rawWEngine.Icon) {
      // Icon field might be just filename or might need .webp extension
      const iconFile = typeof rawWEngine.Icon === 'string' ? rawWEngine.Icon : '';
      icon = iconFile.endsWith('.webp')
        ? `assets/data/images/wengines/${iconFile}`
        : `assets/data/images/wengines/${iconFile}.webp`;
    } else if (rawWEngine.icon) {
      // Fallback to lowercase icon field
      icon = `assets/data/images/wengines/${rawWEngine.icon}.webp`;
    } else {
      // Fallback to rarity/id format
      const rarityLetter = rarity === 'S' ? 'S' : rarity === 'A' ? 'A' : 'B';
      icon = `assets/data/images/wengines/Weapon_${rarityLetter}_${id}.webp`;
    }

    // Get name from Name field or fallback to EN
    const name = rawWEngine.Name || rawWEngine.EN || `W-Engine ${id}`;

    return {
      id: id,
      name: name,
      rarity: rarity,
      specialty: specialty,
      baseAtk: baseAtk,
      subStat: {
        type: subStatType,
        value: subStatValue
      },
      effect: {
        name: 'Effect',
        description: effectDesc,
        properties: refinementProperties.length > 0 ? refinementProperties : undefined
      },
      icon: icon
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
    // RandProperty.Value is in basis points for % stats (e.g., 800 = 8.00%), but flat values for Anomaly Proficiency/Impact
    const randProp = raw.RandProperty || {};
    const subStatName = randProp.Name || 'ATK';
    // Convert from basis points to percentage ONLY for percentage stats
    // Check Format field: if it contains '%', it's a percentage stat that needs division
    const format = randProp.Format || '';
    const isPercentageStat = format.includes('%');
    const subStatValue = isPercentageStat ? (randProp.Value || 0) / 100 : (randProp.Value || 0);

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
    } else if (subStatName.includes('Anomaly Mastery')) {
      subStatType = 'Anomaly_Mastery';
    } else if (subStatName.includes('Anomaly Proficiency')) {
      subStatType = 'Anomaly_Proficiency';
    } else if (subStatName.includes('Impact')) {
      subStatType = 'Impact';
    } else if (subStatName.includes('Energy')) {
      subStatType = 'Energy_Regen';
    } else if (subStatName.includes('PEN')) {
      subStatType = 'PEN_Ratio';
    }

    // Get effect description from Effect.Desc first, then fallback to Talents (first talent)
    const talents = raw.Talents || {};
    const firstTalent = talents['1'] || {};
    const effectDesc = raw.Effect?.Desc || firstTalent.Desc || raw.Desc || 'No description available';

    // Extract icon from Icon field or construct from rarity/id
    let icon: string;
    if (raw.Icon && typeof raw.Icon === 'string') {
      // Icon format: "Assets/.../UnPacker/Weapon_B_Common_01.png"
      // Extract filename and convert to webp
      const fileName = raw.Icon.split('/').pop()?.replace('.png', '.webp');
      icon = fileName ? `assets/data/images/wengines/${fileName}` : `assets/data/images/wengines/Weapon_${rarity}_${id}.webp`;
    } else {
      // Fallback to rarity/id format
      const rarityLetter = rarity === 'S' ? 'S' : rarity === 'A' ? 'A' : 'B';
      icon = `assets/data/images/wengines/Weapon_${rarityLetter}_${id}.webp`;
    }

    // Extract refinement properties if available - prefer Effect.Properties over Talents
    let refinementProperties: any[] = [];
    if (raw.Effect?.Properties && Array.isArray(raw.Effect.Properties)) {
      refinementProperties = this.extractRefinementProperties(raw.Effect.Properties);
    } else {
      refinementProperties = this.extractRefinementPropertiesFromTalents();
    }

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
        description: effectDesc,
        properties: refinementProperties.length > 0 ? refinementProperties : undefined
      },
      signature: raw.CharacterId ? String(raw.CharacterId) : undefined,
      icon: icon
    };
  }

  /**
   * Transform a single agent with enhanced stats from agents.json
   * Icon field is now included in agents.json, no need for separate character files
   */
  transformAgentWithDetailedStats(id: string, basicAgent: any): Agent {
    // Check for HP ascension bonus FIRST (same logic as transformSingleAgent)
    let hasHPAscension = false;
    let hpAscensionPercent = 0;

    if (basicAgent.extra_ascension) {
      const level60Phase = basicAgent.extra_ascension.find((phase: any) => phase.max_level === 60);
      if (level60Phase && level60Phase.props) {
        const hpProp = level60Phase.props.find((prop: any) => prop.id === 11102);
        if (hpProp) {
          hasHPAscension = true;
          hpAscensionPercent = hpProp.value / 100; // 1800 -> 18
        }
      }
    }
    else if (basicAgent.ExtraLevel) {
      const finalPhase = basicAgent.ExtraLevel['6'];
      if (finalPhase && finalPhase.Extra && finalPhase.Extra['11102']) {
        hasHPAscension = true;
        hpAscensionPercent = finalPhase.Extra['11102'].Value / 100; // 1800 -> 18
      }
    }

    // Use detailed stats if available, otherwise fall back to extractLevel60Stats
    const lvl60Stats = this.extractLevel60Stats(basicAgent, hasHPAscension, hpAscensionPercent);

    if (!lvl60Stats) {
      throw new Error(`Failed to extract stats for agent ${id}`);
    }

    // Use rarity directly if available (agents.json), otherwise map from rank
    const rarity = (basicAgent.rarity || this.mappingService.getRarity(basicAgent.rank)) as 'A' | 'S';
    // Use element/specialty directly or map from ID
    const element = this.mappingService.getElement(basicAgent.element?.id || basicAgent.element);
    const specialty = this.mappingService.getSpecialty(basicAgent.specialty?.id || basicAgent.type);

    // Extract icon - prefer Icon field if available, fallback to normalized name
    const agentName = basicAgent.name || basicAgent.EN || basicAgent.Name || 'Unknown';
    let icon: string;
    if (basicAgent.Icon && !basicAgent.Icon.startsWith('IconRole')) {
      // Icon field exists and is not the old IconRole format - use it directly
      const iconFileName = basicAgent.Icon.endsWith('.webp') ? basicAgent.Icon : `${basicAgent.Icon}.webp`;
      icon = `assets/data/images/agents/${iconFileName}`;
    } else {
      // Fallback: normalize agent name to match icon filename format
      const iconFileName = this.normalizeAgentNameForIcon(agentName);
      icon = `assets/data/images/agents/${iconFileName}.webp`;
    }

    // Map element icon
    const elementIcon = `assets/data/images/elements/Icon${element}.webp`;

    // Check for special element icons for specific agents
    let specialElementIcon: string | undefined;
    const agentIdStr = id.toString();
    if (agentIdStr === '1091') {
      // Miyabi - Frost (Ice variant)
      specialElementIcon = 'Frost';
    } else if (agentIdStr === '1371') {
      // Yi Xuan - AuricInk (Ether variant)
      specialElementIcon = 'AuricInk';
    } else if (agentIdStr === '1431') {
      // Ye Shunguang - HonedEdge (Physical variant)
      specialElementIcon = 'HonedEdge';
    }

    // Map specialty icon
    const specialtyIcon = `assets/data/images/roles/Icon${specialty === 'Attack' ? 'AttackType' : specialty}.webp`;

    // Extract mindscape effects from basicAgent (agents.json has mindscape_cinemas)
    const mindscapeEffects = this.extractMindscapeEffects(basicAgent.mindscape_cinemas || []);

    const agent = {
      id: id,
      name: basicAgent.name || basicAgent.EN || basicAgent.Name || 'Unknown',
      rarity: rarity,
      element: element,
      specialty: specialty,
      lvl60Stats: lvl60Stats,
      icon: icon,
      elementIcon: elementIcon,
      specialElementIcon: specialElementIcon,
      specialtyIcon: specialtyIcon,
      mindscapeEffects: mindscapeEffects.length > 0 ? mindscapeEffects : undefined,
      scoring: basicAgent.scoring, // Include scoring data (buffs, debuffs, dazeBonus)
      hasHPAscension: hasHPAscension ? true : undefined,
      hpAscensionPercent: hasHPAscension ? hpAscensionPercent : undefined
    };

    return agent;
  }

  /**
   * Extract mindscape effects from mindscape_cinemas array
   * Only includes mindscapes that provide stat bonuses matching BaseStats
   */
  private extractMindscapeEffects(mindscapeCinemas: any[]): any[] {
    if (!mindscapeCinemas || mindscapeCinemas.length === 0) {
      return [];
    }

    const effects: any[] = [];

    mindscapeCinemas.forEach(cinema => {
      const statBonuses = this.parseMindscapeStatBonuses(cinema.description);

      // Only include mindscapes that have stat bonuses
      if (statBonuses.length > 0) {
        effects.push({
          level: cinema.level,
          name: cinema.name,
          description: cinema.description,
          statBonuses: statBonuses
        });
      }
    });

    return effects;
  }

  /**
   * Parse mindscape description to extract stat bonuses
   * Only extracts bonuses that match BaseStats model
   */
  private parseMindscapeStatBonuses(description: string): any[] {
    const bonuses: any[] = [];

    // Patterns for different stat types
    const patterns = [
      { regex: /ATK increases by (\d+(?:\.\d+)?)%/i, type: 'ATK%', conditional: false },
      { regex: /HP (?:increases|is increased) by (\d+(?:\.\d+)?)%/i, type: 'HP%', conditional: false },
      { regex: /Max HP increases by (\d+(?:\.\d+)?)%/i, type: 'HP%', conditional: false },
      { regex: /DEF increases by (\d+(?:\.\d+)?)%/i, type: 'DEF%', conditional: false },
      { regex: /CRIT Rate increases by (\d+(?:\.\d+)?)%/i, type: 'CRIT_Rate', conditional: false },
      { regex: /CRIT DMG increases by (\d+(?:\.\d+)?)%/i, type: 'CRIT_DMG', conditional: false },
      { regex: /PEN Ratio increases by (\d+(?:\.\d+)?)%/i, type: 'PEN_Ratio', conditional: false },
      { regex: /Energy (?:Generation Rate|Regen) increases by (\d+(?:\.\d+)?)%/i, type: 'Energy_Regen', conditional: false },
      { regex: /Anomaly Proficiency increases by (\d+)/i, type: 'Anomaly_Proficiency', conditional: false },
      { regex: /Anomaly Mastery increases by (\d+)/i, type: 'Anomaly_Mastery', conditional: false },
      { regex: /Impact increases by (\d+)/i, type: 'Impact', conditional: false },
    ];

    patterns.forEach(pattern => {
      const match = description.match(pattern.regex);
      if (match) {
        const value = parseFloat(match[1]);
        bonuses.push({
          type: pattern.type,
          value: value,
          conditional: pattern.conditional
        });
      }
    });

    return bonuses;
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

    // Transform icon path from game format to local assets
    // Example: "UI/Sprite/A1DynamicLoad/IconSuit/UnPacker/SuitWoodpeckerElectro.png"
    // becomes: "assets/data/images/discs/SuitWoodpeckerElectro.webp"
    let icon: string | undefined;
    const iconPath = raw.Icon || raw.Icon2;
    if (iconPath) {
      const fileName = iconPath.split('/').pop()?.replace('.png', '.webp');
      icon = `assets/data/images/discs/${fileName}`;
    }

    return {
      id: id,
      name: raw.Name,
      bonuses: bonuses,
      icon: icon
    };
  }

  /**
   * Extract refinement properties from Effect.Properties array
   * Properties format: { Name: "ATK", Overclock: { W1: 1000, W2: 1150, ... } }
   * Values are in basis points (1000 = 10%)
   */
  private extractRefinementProperties(properties: any[]): any[] {
    if (!properties || properties.length === 0) {
      return [];
    }

    return properties.map(prop => {
      const name = prop.Name || '';
      const overclock = prop.Overclock || {};
      const format = prop.Format || '';

      // Map property name to our stat type
      let type: any = 'ATK%';
      if (name === 'CRIT Rate') {
        type = 'CRIT_Rate';
      } else if (name === 'CRIT DMG') {
        type = 'CRIT_DMG';
      } else if (name.includes('ATK')) {
        type = 'ATK%';
      } else if (name.includes('DEF')) {
        type = 'DEF%';
      } else if (name.includes('HP')) {
        type = 'HP%';
      } else if (name.includes('Anomaly Mastery')) {
        type = 'Anomaly_Mastery';
      } else if (name.includes('Anomaly Proficiency')) {
        type = 'Anomaly_Proficiency';
      } else if (name.includes('Impact')) {
        type = 'Impact';
      } else if (name.includes('Energy')) {
        type = 'Energy_Regen';
      } else if (name.includes('PEN')) {
        type = 'PEN_Ratio';
      }

      // Convert from basis points to percentage ONLY for percentage stats
      // Check Format field: if it contains '%', it's a percentage stat that needs division
      const isPercentageStat = format.includes('%');
      const divisor = isPercentageStat ? 100 : 1;

      return {
        name: name,
        type: type,
        values: {
          W1: (overclock.W1 || 0) / divisor,
          W2: (overclock.W2 || 0) / divisor,
          W3: (overclock.W3 || 0) / divisor,
          W4: (overclock.W4 || 0) / divisor,
          W5: (overclock.W5 || 0) / divisor
        }
      };
    });
  }

  /**
   * Extract refinement properties from weapon/{id}.json Talents object
   * Note: Talents in weapon files don't have stat bonuses, they only have effect descriptions
   * The actual stat bonuses are in Effect.Properties from wengines.json
   * So this method returns empty array for weapon files
   */
  private extractRefinementPropertiesFromTalents(): any[] {
    // Weapon/{id}.json Talents only contain effect descriptions, not stat bonuses
    // Stat bonuses come from wengines.json Effect.Properties
    return [];
  }
}
