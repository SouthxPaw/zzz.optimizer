/**
 * Agent skill multipliers for damage estimation
 * These represent the "typical" skill rotation damage per hit
 *
 * Based on community testing and skill descriptions
 * Updated: 2026-01-13
 */

/**
 * Agent skill multipliers (Motion Values)
 * Represents average damage multiplier for typical rotation
 */
export const AGENT_SKILL_MULTIPLIERS: { [agentName: string]: number } = {
  // S-Rank Attack Agents (High burst damage)
  'Ellen': 3.8,           // High burst with charged attacks and ult
  'Zhu Yuan': 3.2,        // Follow-up attacks with CRIT focus
  'Soldier 11': 2.9,      // Combo finishers and EX special
  'Billy': 2.6,           // Rapid shots with CRIT multipliers
  'Corin': 3.0,           // EX Special burst rotation
  'Nekomata': 2.7,        // Split attacks with CRIT

  // S-Rank Anomaly Agents (Status damage focused)
  'Grace': 2.0,           // Shock application (status > direct)
  'Jane': 2.5,            // Assault + direct damage hybrid
  'Burnice': 2.2,         // Burn application

  // A-Rank Anomaly Agents
  'Piper': 2.3,           // Physical Assault

  // S-Rank Stun Agents (Impact + moderate damage)
  'Koleda': 2.4,          // Fire Impact with decent multipliers
  'Lycaon': 2.6,          // Ice Impact with CRIT potential
  'Qingyi': 2.5,          // Electric Impact with fast attacks

  // A-Rank Stun Agents
  'Anby': 2.1,            // Basic Electric Impact

  // S-Rank Support/Defense (Low damage, utility focused)
  'Rina': 1.8,            // Electric support
  'Caesar': 2.0,          // Defense with some damage

  // A-Rank Support/Defense
  'Nicole': 1.5,          // Pure support (DEF shred)
  'Soukaku': 1.6,         // Ice support (ATK buff)
  'Ben': 1.9,             // Fire defense
  'Lucy': 1.7,            // Fire support

  // Default fallback (balanced agent)
  'default': 2.5,
};

/**
 * Agent elemental damage bonus availability
 * Some agents have built-in elemental damage in their kit
 */
export const AGENT_ELEMENTAL_BONUS: { [agentName: string]: number } = {
  // Most agents don't have built-in elemental DMG (comes from discs)
  // These are just examples if needed in the future
  'default': 0.0,
};

/**
 * Get skill multiplier for an agent
 *
 * @param agentName - Name of the agent
 * @returns Motion value multiplier for typical rotation
 */
export function getAgentSkillMultiplier(agentName: string): number {
  return AGENT_SKILL_MULTIPLIERS[agentName] || AGENT_SKILL_MULTIPLIERS['default'];
}

/**
 * Get agent's built-in elemental damage bonus (if any)
 *
 * @param agentName - Name of the agent
 * @returns Elemental damage bonus as decimal (0.30 = 30%)
 */
export function getAgentElementalBonus(agentName: string): number {
  return AGENT_ELEMENTAL_BONUS[agentName] || AGENT_ELEMENTAL_BONUS['default'];
}

/**
 * Determine primary damage type for agent role
 * Used to decide whether to calculate direct damage or status damage
 */
export function getAgentDamageType(role: string): 'direct' | 'status' | 'sheer_force' | 'daze' {
  switch (role) {
    case 'Attack':
      return 'direct';
    case 'Anomaly':
      return 'status';
    case 'Rupture':
      return 'sheer_force'; // Rupture agents use Sheer Force (ignores DEF)
    case 'Stun':
      return 'daze'; // Stun agents focus on Daze contribution + moderate damage
    case 'Support':
    case 'Defense':
      return 'direct'; // Low damage but still direct
    default:
      return 'direct';
  }
}

/**
 * Get status effect type based on agent element
 * Used for Anomaly agents to calculate status damage
 */
export function getStatusEffectType(element: string): 'BURN' | 'SHOCK' | 'SHATTER' | 'ASSAULT' | 'CORRUPTION' {
  switch (element.toLowerCase()) {
    case 'fire':
      return 'BURN';
    case 'electric':
      return 'SHOCK';
    case 'ice':
      return 'SHATTER';
    case 'physical':
      return 'ASSAULT';
    case 'ether':
      return 'CORRUPTION';
    default:
      return 'SHOCK'; // Default fallback
  }
}
