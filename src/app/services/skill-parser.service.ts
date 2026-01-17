import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { versionedUrl } from '../utils/versioned-url';

/**
 * Service to parse agent skill multipliers from character JSON files
 * Extracts damage multipliers and calculates average rotation damage
 */

export interface SkillMultiplier {
  agentId: string;
  agentName: string;
  averageMultiplier: number; // Weighted average of common rotation
  basicAttack: number;
  specialAttack: number;
  exSpecialAttack: number;
  ultimate: number;
}

@Injectable({
  providedIn: 'root'
})
export class SkillParserService {
  private skillMultipliers: { [agentId: string]: SkillMultiplier } = {};
  private loaded = false;

  constructor(private http: HttpClient) {}

  /**
   * Load and parse skill multipliers for all agents
   */
  async loadSkillMultipliers(agentIds: string[]): Promise<void> {
    if (this.loaded) return;

    const promises = agentIds.map(id => this.parseAgentSkills(id));
    await Promise.allSettled(promises);

    this.loaded = true;
    console.log(`Loaded skill multipliers for ${Object.keys(this.skillMultipliers).length} agents`);
  }

  /**
   * Parse skill multipliers from a character JSON file
   */
  private async parseAgentSkills(agentId: string): Promise<void> {
    try {
      const characterData: any = await firstValueFrom(
        this.http.get(versionedUrl(`assets/data/character/${agentId}.json`))
      );

      // Extract skill multipliers
      const skills = characterData.Skill || {};

      // Basic Attack (usually a combo, take weighted average)
      const basicAttack = this.extractBasicAttackMultiplier(skills.Basic);

      // Special Attack (regular Special)
      const specialAttack = this.extractSpecialAttackMultiplier(skills.Special, false);

      // EX Special Attack (enhanced Special)
      const exSpecialAttack = this.extractSpecialAttackMultiplier(skills.Special, true);

      // Ultimate (Chain Attack Ultimate)
      const ultimate = this.extractUltimateMultiplier(skills.Chain);

      // Calculate weighted average for typical rotation
      // Typical rotation: 70% basic/special, 30% ultimate/EX
      const averageMultiplier = (
        basicAttack * 0.40 +       // 40% basic attacks
        specialAttack * 0.20 +     // 20% special attacks
        exSpecialAttack * 0.20 +   // 20% EX special attacks
        ultimate * 0.20            // 20% ultimates
      ) / 100; // Convert from basis points to decimal

      this.skillMultipliers[agentId] = {
        agentId,
        agentName: characterData.Name || 'Unknown',
        averageMultiplier,
        basicAttack: basicAttack / 100,
        specialAttack: specialAttack / 100,
        exSpecialAttack: exSpecialAttack / 100,
        ultimate: ultimate / 100,
      };

    } catch (error) {
      console.warn(`Failed to parse skills for agent ${agentId}:`, error);
    }
  }

  /**
   * Extract basic attack multiplier (weighted average of combo)
   */
  private extractBasicAttackMultiplier(basicSkill: any): number {
    if (!basicSkill?.Description) return 250; // Default 250% if not found

    let totalDamage = 0;
    let hitCount = 0;

    // Find the "Basic Attack" section with parameters
    const basicAttackSection = basicSkill.Description.find((desc: any) =>
      desc.Name?.includes('Basic Attack') && desc.Param
    );

    if (basicAttackSection?.Param) {
      // Sum up all hit multipliers
      for (const param of basicAttackSection.Param) {
        if (param.Name?.includes('DMG Multiplier') && param.Param) {
          const skillId = Object.keys(param.Param)[0];
          const skillData = param.Param[skillId];

          if (skillData.DamagePercentage) {
            totalDamage += skillData.DamagePercentage;
            hitCount++;
          }
        }
      }
    }

    // Return average damage per hit (or total if combo)
    return hitCount > 0 ? totalDamage / hitCount : 250;
  }

  /**
   * Extract special attack multiplier
   */
  private extractSpecialAttackMultiplier(specialSkill: any, isEX: boolean): number {
    if (!specialSkill?.Description) return isEX ? 500 : 300; // Defaults

    const searchTerm = isEX ? 'EX Special Attack' : 'Special Attack';

    // Find the section for regular or EX special
    const specialSection = specialSkill.Description.find((desc: any) => {
      if (!desc.Name) return false;
      return isEX
        ? desc.Name.includes('EX Special') && !desc.Name.includes('(Quick Launch)')
        : desc.Name.includes('Special Attack') && !desc.Name.includes('EX') && !desc.Name.includes('(Quick Launch)');
    });

    if (specialSection?.Param) {
      // Find DMG Multiplier parameter
      const dmgParam = specialSection.Param.find((p: any) =>
        p.Name?.includes('DMG Multiplier') && p.Param
      );

      if (dmgParam?.Param) {
        const skillId = Object.keys(dmgParam.Param)[0];
        const skillData = dmgParam.Param[skillId];

        if (skillData.DamagePercentage) {
          return skillData.DamagePercentage;
        }
      }
    }

    return isEX ? 500 : 300; // Fallback defaults
  }

  /**
   * Extract ultimate multiplier
   */
  private extractUltimateMultiplier(chainSkill: any): number {
    if (!chainSkill?.Description) return 800; // Default 800% if not found

    // Find the "Ultimate" section
    const ultimateSection = chainSkill.Description.find((desc: any) =>
      desc.Name?.includes('Ultimate')
    );

    if (ultimateSection?.Param) {
      // Find DMG Multiplier parameter
      const dmgParam = ultimateSection.Param.find((p: any) =>
        p.Name?.includes('DMG Multiplier') && p.Param
      );

      if (dmgParam?.Param) {
        const skillId = Object.keys(dmgParam.Param)[0];
        const skillData = dmgParam.Param[skillId];

        if (skillData.DamagePercentage) {
          return skillData.DamagePercentage;
        }
      }
    }

    return 800; // Fallback default
  }

  /**
   * Get skill multiplier for an agent
   */
  getAgentMultiplier(agentId: string): number {
    const multiplier = this.skillMultipliers[agentId];
    if (!multiplier) {
      console.warn(`No skill multiplier found for agent ${agentId}, using default 2.5`);
      return 2.5;
    }
    return multiplier.averageMultiplier;
  }

  /**
   * Get detailed skill multipliers for an agent
   */
  getAgentSkillBreakdown(agentId: string): SkillMultiplier | null {
    return this.skillMultipliers[agentId] || null;
  }

  /**
   * Check if skill multipliers are loaded
   */
  areMultipliersLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Get all loaded multipliers
   */
  getAllMultipliers(): { [agentId: string]: SkillMultiplier } {
    return this.skillMultipliers;
  }
}
