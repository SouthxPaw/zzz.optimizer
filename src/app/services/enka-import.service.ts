import { Injectable } from '@angular/core';
import { Disc } from '../models/disc.model';
import { BuildService, AgentBuild } from './build.service';
import { DiscService } from './disc.service';
import { EnkaBuildData } from './enka-api.service';
import { DbService } from './db.service';

export interface ImportComparison {
  newBuilds: EnkaBuildData[];
  updatedBuilds: { old: AgentBuild; new: EnkaBuildData }[];
  unchangedBuilds: AgentBuild[];
  newDiscs: Disc[];
}

export interface ImportResult {
  added: number;
  updated: number;
  unchanged: number;
  totalDiscs: number;
}

@Injectable({
  providedIn: 'root'
})
export class EnkaImportService {
  constructor(
    private buildService: BuildService,
    private discService: DiscService,
    private dbService: DbService
  ) {}

  /**
   * Compare Enka builds with existing builds and determine what to import
   */
  async compareBuilds(enkaBuilds: EnkaBuildData[]): Promise<ImportComparison> {
    const existingBuilds = this.buildService.getBuilds();
    const newBuilds: EnkaBuildData[] = [];
    const updatedBuilds: { old: AgentBuild; new: EnkaBuildData }[] = [];
    const unchangedBuilds: AgentBuild[] = [];
    const newDiscs: Disc[] = [];

    for (const enkaBuild of enkaBuilds) {
      // Find existing build for this agent
      const existingBuild = existingBuilds.find(b => b.agentId === enkaBuild.agentId);

      if (!existingBuild) {
        // New agent build
        newBuilds.push(enkaBuild);
        newDiscs.push(...Object.values(enkaBuild.discs).filter(d => d !== undefined) as Disc[]);
      } else {
        // Check if build changed
        if (this.hasChanges(existingBuild, enkaBuild)) {
          updatedBuilds.push({ old: existingBuild, new: enkaBuild });
          newDiscs.push(...Object.values(enkaBuild.discs).filter(d => d !== undefined) as Disc[]);
        } else {
          unchangedBuilds.push(existingBuild);
        }
      }
    }

    return { newBuilds, updatedBuilds, unchangedBuilds, newDiscs };
  }

  /**
   * Import builds and discs into the database
   */
  async importBuilds(comparison: ImportComparison, replaceExisting: boolean = true): Promise<ImportResult> {
    let added = 0;
    let updated = 0;
    const unchanged = comparison.unchangedBuilds.length;
    let totalDiscs = 0;

    // Import new builds
    for (const enkaBuild of comparison.newBuilds) {
      const agent = await this.dbService.getAgent(enkaBuild.agentId);
      if (!agent) {
        console.warn(`Agent ${enkaBuild.agentId} not found, skipping`);
        continue;
      }

      // Create build
      const newBuild = await this.buildService.createBuild(agent, enkaBuild.mindscapeLevel);

      // Import discs first
      const discsBySlot: { [slot: string]: Disc } = {};
      for (const [slot, disc] of Object.entries(enkaBuild.discs)) {
        if (disc) {
          await this.discService.addDisc(disc);
          discsBySlot[slot] = disc;
          totalDiscs++;
        }
      }

      // Update build with equipment
      await this.buildService.updateBuild(newBuild.id, {
        level: enkaBuild.level,
        equippedWEngine: enkaBuild.wEngine,
        wEngineRefinement: enkaBuild.wEngineRefinement || 1,
        equippedDiscs: discsBySlot
      });

      added++;
    }

    // Import updated builds
    if (replaceExisting) {
      for (const { old, new: enkaBuild } of comparison.updatedBuilds) {
        // Remove old discs from disc inventory
        const oldDiscs = Object.values(old.equippedDiscs).filter(d => d !== undefined) as Disc[];
        for (const disc of oldDiscs) {
          await this.discService.deleteDisc(disc.uid);
        }

        // Import new discs
        const discsBySlot: { [slot: string]: Disc } = {};
        for (const [slot, disc] of Object.entries(enkaBuild.discs)) {
          if (disc) {
            await this.discService.addDisc(disc);
            discsBySlot[slot] = disc;
            totalDiscs++;
          }
        }

        // Update build
        await this.buildService.updateBuild(old.id, {
          level: enkaBuild.level,
          mindscapeLevel: enkaBuild.mindscapeLevel,
          equippedWEngine: enkaBuild.wEngine,
          wEngineRefinement: enkaBuild.wEngineRefinement || 1,
          equippedDiscs: discsBySlot
        });

        updated++;
      }
    }

    return { added, updated, unchanged, totalDiscs };
  }

  /**
   * Check if a build has changed compared to existing build
   */
  private hasChanges(existing: AgentBuild, incoming: EnkaBuildData): boolean {
    // Check level changes
    if (existing.level !== incoming.level) {
      return true;
    }

    // Check mindscape changes
    if (existing.mindscapeLevel !== incoming.mindscapeLevel) {
      return true;
    }

    // Check W-Engine changes
    if (this.hasWEngineChanges(existing, incoming)) {
      return true;
    }

    // Check disc changes
    if (this.hasDiscChanges(existing, incoming)) {
      return true;
    }

    return false;
  }

  /**
   * Check if W-Engine has changed
   */
  private hasWEngineChanges(existing: AgentBuild, incoming: EnkaBuildData): boolean {
    // Both have no W-Engine
    if (!existing.equippedWEngine && !incoming.wEngine) {
      return false;
    }

    // One has W-Engine, other doesn't
    if (!existing.equippedWEngine || !incoming.wEngine) {
      return true;
    }

    // Different W-Engine
    if (existing.equippedWEngine.id !== incoming.wEngine.id) {
      return true;
    }

    // Different W-Engine refinement
    if (existing.wEngineRefinement !== (incoming.wEngineRefinement || 1)) {
      return true;
    }

    return false;
  }

  /**
   * Check if discs have changed
   */
  private hasDiscChanges(existing: AgentBuild, incoming: EnkaBuildData): boolean {
    const existingDiscSlots = Object.keys(existing.equippedDiscs);
    const incomingDiscSlots = Object.keys(incoming.discs);

    // Different number of equipped discs
    if (existingDiscSlots.length !== incomingDiscSlots.length) {
      return true;
    }

    // Check each slot
    for (const slot of existingDiscSlots) {
      const existingDisc = existing.equippedDiscs[slot];
      const incomingDisc = incoming.discs[slot as keyof typeof incoming.discs];

      // Slot missing in incoming
      if (!incomingDisc) {
        return true;
      }

      // Compare disc properties
      if (!existingDisc || this.hasDiscPropertyChanges(existingDisc, incomingDisc)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Compare two discs to see if they're different
   */
  private hasDiscPropertyChanges(existing: Disc, incoming: Disc): boolean {
    // Different disc set
    if (existing.set !== incoming.set) {
      return true;
    }

    // Different level
    if (existing.level !== incoming.level) {
      return true;
    }

    // Different main stat
    if (existing.mainStat.type !== incoming.mainStat.type) {
      return true;
    }

    // Different main stat value (allow small tolerance for rounding)
    if (Math.abs(existing.mainStat.value - incoming.mainStat.value) > 0.1) {
      return true;
    }

    // Different number of substats
    if (existing.subStats.length !== incoming.subStats.length) {
      return true;
    }

    // Compare substats
    for (let i = 0; i < existing.subStats.length; i++) {
      const existingSub = existing.subStats[i];
      const incomingSub = incoming.subStats.find(s => s.type === existingSub.type);

      if (!incomingSub) {
        return true; // Substat type missing
      }

      // Check if value changed significantly (allow small tolerance)
      if (Math.abs(existingSub.value - incomingSub.value) > 0.1) {
        return true;
      }

      // Check if rolls changed
      if (existingSub.rolls !== incomingSub.rolls) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate a summary of import changes
   */
  generateImportSummary(comparison: ImportComparison): string {
    const parts: string[] = [];

    if (comparison.newBuilds.length > 0) {
      parts.push(`${comparison.newBuilds.length} new agent(s)`);
    }

    if (comparison.updatedBuilds.length > 0) {
      parts.push(`${comparison.updatedBuilds.length} updated build(s)`);
    }

    if (comparison.unchangedBuilds.length > 0) {
      parts.push(`${comparison.unchangedBuilds.length} unchanged`);
    }

    parts.push(`${comparison.newDiscs.length} disc(s)`);

    return parts.join(', ');
  }
}
