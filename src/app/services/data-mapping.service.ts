import { Injectable } from '@angular/core';
import { Element, Specialty } from '../models/agent.model';

/**
 * Service for mapping game data IDs and codes to application format
 */
@Injectable({
  providedIn: 'root'
})
export class DataMappingService {

  /**
   * Map raw game element codes to Element types
   */
  readonly elementMap: { [key: number]: Element } = {
    200: 'Physical',
    201: 'Fire',
    202: 'Ice',
    203: 'Electric',
    204: 'Wind',
    205: 'Ether',
    206: 'Lumen'
  };

  /**
   * Map raw game type codes to Specialty types
   * 1 = Attack, 2 = Stun, 3 = Anomaly, 4 = Support, 5 = Defense, 6 = Rupture, 7 = Armorer
   *
   * NOTE: 7 is an ASSUMED id for Armorer (Claret). The real game code is unknown
   * until Claret releases - verify and correct if it differs.
   */
  readonly specialtyMap: { [key: number]: Specialty } = {
    1: 'Attack',
    2: 'Stun',
    3: 'Anomaly',
    4: 'Support',
    5: 'Defense',
    6: 'Rupture',
    7: 'Armorer'
  };

  /**
   * Map rank codes to rarity letters
   * 2 = B-rank, 3 = A-rank, 4+ = S-rank
   */
  readonly rarityMap: { [key: number]: 'S' | 'A' | 'B' } = {
    2: 'B',
    3: 'A',
    4: 'S',
    5: 'S'
  };

  /**
   * Get element from numeric code
   */
  getElement(code: number): Element {
    return this.elementMap[code] || 'Physical';
  }

  /**
   * Get specialty from numeric code
   */
  getSpecialty(code: number): Specialty {
    return this.specialtyMap[code] || 'Attack';
  }

  /**
   * Get specialty from string name (for weapon JSON format)
   */
  getSpecialtyFromName(name: string): Specialty {
    const nameMap: { [key: string]: Specialty } = {
      'Attack': 'Attack',
      'Stun': 'Stun',
      'Anomaly': 'Anomaly',
      'Support': 'Support',
      'Defense': 'Defense',
      'Rupture': 'Rupture',
      'Armorer': 'Armorer'
    };
    return nameMap[name] || 'Attack';
  }

  /**
   * Get rarity from rank code
   */
  getRarity(rank: number): 'S' | 'A' | 'B' {
    return this.rarityMap[rank] || 'A';
  }

  /**
   * Get W-Engine image path from weapon data
   * W-Engine icons follow the pattern: Weapon_{Rarity}_{ID}.webp
   * Example: Weapon_S_1021.webp, Weapon_A_1011.webp
   */
  getWEngineImagePath(icon: string): string {
    // icon format is like "Weapon_S_1021" or "Weapon_B_Common_01"
    return `assets/data/images/wengines/${icon}.webp`;
  }

  /**
   * Get disc set image path from equipment data
   * Disc icons are stored with set names like SuitWoodpeckerElectro.webp
   */
  getDiscSetImagePath(setName: string): string {
    // Convert set name to match image filename format
    // Example: "Woodpecker Electro" -> "SuitWoodpeckerElectro.webp"
    const formattedName = `Suit${setName.replace(/\s+/g, '')}`;
    return `assets/data/images/discs/${formattedName}.webp`;
  }

  /**
   * Get element icon path
   * Can accept a special element icon name (Frost, AuricInk, HonedEdge) or standard element
   */
  getElementIconPath(element: Element | string): string {
    // Special element icons
    const specialIconMap: { [key: string]: string } = {
      'Frost': 'IconFrost.webp',
      'AuricInk': 'IconAuricInk.webp',
      'HonedEdge': 'IconHonedEdge.webp'
    };

    // Check if it's a special element
    if (typeof element === 'string' && specialIconMap[element]) {
      return `assets/data/images/elements/${specialIconMap[element]}`;
    }

    // Standard element icons
    const iconMap: { [key in Element]: string } = {
      'Physical': 'IconPhysical.webp',
      'Fire': 'IconFire.webp',
      'Ice': 'IconIce.webp',
      'Electric': 'IconElectric.webp',
      'Wind': 'IconWind.webp',
      'Ether': 'IconEther.webp',
      'Lumen': 'IconLumen.webp'
    };
    return `assets/data/images/elements/${iconMap[element as Element]}`;
  }

  /**
   * Get specialty/role icon path
   */
  getSpecialtyIconPath(specialty: Specialty): string {
    const iconMap: { [key in Specialty]: string } = {
      'Attack': 'IconAttackType.webp',
      'Stun': 'IconStun.webp',
      'Anomaly': 'IconAnomaly.webp',
      'Support': 'IconSupport.webp',
      'Defense': 'IconDefense.webp',
      'Rupture': 'IconRupture.webp',
      'Armorer': 'IconArmorer.webp'
    };
    return `assets/data/images/roles/${iconMap[specialty]}`;
  }

  /**
   * Extract agent code name from agents.json data
   */
  getAgentCodeName(rawAgent: any): string {
    return rawAgent.code || rawAgent.EN || 'Unknown';
  }

  /**
   * Extract agent description from agents.json data
   */
  getAgentDescription(rawAgent: any): string {
    return rawAgent.desc || '';
  }
}
