import { Disc } from './disc.model';

/**
 * Disc Loadout Model
 * Represents a saved disc configuration for a specific agent
 * Allows users to save and load disc setups quickly
 */
export interface DiscLoadout {
  /** Unique identifier for the loadout */
  id: string;

  /** User-defined name for the loadout (e.g., "Crit DPS", "Energy Regen") */
  name: string;

  /** Agent ID this loadout belongs to (e.g., "anby", "billy") */
  agentId: string;

  /** Dictionary of equipped discs by slot (Drive1-Drive6) */
  equippedDiscs: { [slot: string]: Disc };

  /** When the loadout was created */
  createdAt: Date;

  /** When the loadout was last updated */
  updatedAt: Date;
}
