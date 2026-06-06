import { Injectable } from '@angular/core';
import { BuildService, AgentBuild } from './build.service';
import { DiscService } from './disc.service';
import { DiscLoadoutService } from './disc-loadout.service';
import { Disc } from '../models/disc.model';
import { DiscLoadout } from '../models/disc-loadout.model';

export interface ExportData {
  version: string;
  exportDate: string;
  builds: AgentBuild[];
  discs: Disc[];
  loadouts?: DiscLoadout[]; // Optional for backwards compatibility
}

@Injectable({
  providedIn: 'root'
})
export class BuildImportExportService {
  private readonly EXPORT_VERSION = '3.0';  // Updated for disc loadouts

  // Version history:
  // 1.0 - Initial version (basic builds and discs)
  // 2.0 - Added W-Engine refinement properties, mindscape effects, icons
  // 3.0 - Added disc loadouts support

  constructor(
    private buildService: BuildService,
    private discService: DiscService,
    private discLoadoutService: DiscLoadoutService
  ) { }

  /**
   * Export all builds, discs, and loadouts to JSON
   */
  async exportBuilds(): Promise<string> {
    const builds = await this.buildService.getAllBuilds();
    const discs = await this.discService.getAllDiscs();
    const loadouts = this.discLoadoutService.getAllLoadouts();

    const exportData: ExportData = {
      version: this.EXPORT_VERSION,
      exportDate: new Date().toISOString(),
      builds: builds,
      discs: discs,
      loadouts: loadouts
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Download builds as a JSON file
   */
  async downloadBuilds(): Promise<void> {
    const json = await this.exportBuilds();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    link.download = `zzz-optimizer-builds-${timestamp}.json`;
    link.click();

    URL.revokeObjectURL(url);
  }

  /**
   * Import builds from JSON data
   */
  async importBuilds(jsonData: string, replaceExisting: boolean = false): Promise<{ success: boolean; message: string; buildsImported: number; discsImported: number; loadoutsImported: number }> {
    try {
      const data: ExportData = JSON.parse(jsonData);

      // Validate data structure
      const validation = this.validateImportData(data);
      if (!validation.valid) {
        return {
          success: false,
          message: `Invalid import file: ${validation.message}`,
          buildsImported: 0,
          discsImported: 0,
          loadoutsImported: 0
        };
      }

      // Check version compatibility
      const fileVersion = data.version || '1.0';  // Default to 1.0 for old files
      const compatibilityCheck = this.checkVersionCompatibility(fileVersion);

      if (!compatibilityCheck.compatible) {
        return {
          success: false,
          message: compatibilityCheck.message,
          buildsImported: 0,
          discsImported: 0,
          loadoutsImported: 0
        };
      }

      // Migrate data if from older version
      const migratedData = this.migrateData(data, fileVersion);

      // If replacing, clear existing data
      if (replaceExisting) {
        await this.buildService.clearAllBuilds();
        await this.discService.clearAllDiscs();
        this.discLoadoutService.clearAllLoadouts();
      }

      // Import discs first (builds and loadouts reference them)
      let discsImported = 0;
      for (const disc of migratedData.discs) {
        try {
          await this.discService.addDisc(disc);
          discsImported++;
        } catch (error) {
          console.warn('Failed to import disc:', disc, error);
        }
      }

      // Import builds
      let buildsImported = 0;
      for (const build of migratedData.builds) {
        try {
          await this.buildService.importBuild(build);
          buildsImported++;
        } catch (error) {
          console.warn('Failed to import build:', build, error);
        }
      }

      // Import loadouts (if present in the export file)
      let loadoutsImported = 0;
      if (migratedData.loadouts && migratedData.loadouts.length > 0) {
        for (const loadout of migratedData.loadouts) {
          try {
            this.discLoadoutService.importLoadout(loadout);
            loadoutsImported++;
          } catch (error) {
            console.warn('Failed to import loadout:', loadout, error);
          }
        }
      }

      const versionWarning = fileVersion !== this.EXPORT_VERSION
        ? ` (migrated from version ${fileVersion})`
        : '';

      const loadoutMessage = loadoutsImported > 0 ? `, ${loadoutsImported} loadouts` : '';

      return {
        success: true,
        message: `Successfully imported ${buildsImported} builds, ${discsImported} discs${loadoutMessage}${versionWarning}`,
        buildsImported,
        discsImported,
        loadoutsImported
      };
    } catch (error) {
      return {
        success: false,
        message: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        buildsImported: 0,
        discsImported: 0,
        loadoutsImported: 0
      };
    }
  }

  /**
   * Check if the import file version is compatible with the current app version
   */
  private checkVersionCompatibility(fileVersion: string): { compatible: boolean; message: string } {
    const supportedVersions = ['1.0', '2.0', '3.0'];  // List of versions we can import

    // Parse version numbers for comparison
    const parseVersion = (version: string): number => {
      const [major, minor] = version.split('.').map(Number);
      return major * 100 + (minor || 0);
    };

    const fileVersionNum = parseVersion(fileVersion);
    const currentVersionNum = parseVersion(this.EXPORT_VERSION);

    // Check if version is supported
    if (!supportedVersions.includes(fileVersion)) {
      // Check if file is from a future version
      if (fileVersionNum > currentVersionNum) {
        return {
          compatible: false,
          message: `Import file is from a newer version (${fileVersion}). Please update ZZZ Optimizer to import this file.`
        };
      }

      // Unknown/unsupported version
      return {
        compatible: false,
        message: `Unsupported import file version (${fileVersion}). Supported versions: ${supportedVersions.join(', ')}`
      };
    }

    // File version is supported
    if (fileVersionNum < currentVersionNum) {
      // Older version - will be migrated
      return {
        compatible: true,
        message: `Import file will be migrated from version ${fileVersion} to ${this.EXPORT_VERSION}`
      };
    }

    // Same version
    return {
      compatible: true,
      message: 'Import file version matches current version'
    };
  }

  /**
   * Validate import data structure
   */
  private validateImportData(data: ExportData): { valid: boolean; message: string } {
    // Check for required fields
    if (!data.builds) {
      return { valid: false, message: 'Missing builds data' };
    }

    if (!data.discs) {
      return { valid: false, message: 'Missing discs data' };
    }

    if (!Array.isArray(data.builds)) {
      return { valid: false, message: 'Builds data must be an array' };
    }

    if (!Array.isArray(data.discs)) {
      return { valid: false, message: 'Discs data must be an array' };
    }

    // Validate loadouts if present (optional for backwards compatibility)
    if (data.loadouts !== undefined && !Array.isArray(data.loadouts)) {
      return { valid: false, message: 'Loadouts data must be an array' };
    }

    // Validate each build has required fields
    for (let i = 0; i < data.builds.length; i++) {
      const build = data.builds[i];
      if (!build.id) {
        return { valid: false, message: `Build at index ${i} missing required field: id` };
      }
      if (!build.agentId) {
        return { valid: false, message: `Build at index ${i} missing required field: agentId` };
      }
      if (build.equippedDiscs === undefined) {
        return { valid: false, message: `Build at index ${i} missing required field: equippedDiscs` };
      }
    }

    // Validate each disc has required fields
    for (let i = 0; i < data.discs.length; i++) {
      const disc = data.discs[i];
      if (!disc.uid) {
        return { valid: false, message: `Disc at index ${i} missing required field: uid` };
      }
      if (!disc.slot) {
        return { valid: false, message: `Disc at index ${i} missing required field: slot` };
      }
      if (!disc.set) {
        return { valid: false, message: `Disc at index ${i} missing required field: set` };
      }
    }

    // Validate each loadout has required fields (if present)
    if (data.loadouts) {
      for (let i = 0; i < data.loadouts.length; i++) {
        const loadout = data.loadouts[i];
        if (!loadout.id) {
          return { valid: false, message: `Loadout at index ${i} missing required field: id` };
        }
        if (!loadout.name) {
          return { valid: false, message: `Loadout at index ${i} missing required field: name` };
        }
        if (!loadout.agentId) {
          return { valid: false, message: `Loadout at index ${i} missing required field: agentId` };
        }
        if (!loadout.equippedDiscs) {
          return { valid: false, message: `Loadout at index ${i} missing required field: equippedDiscs` };
        }
      }
    }

    return { valid: true, message: 'Import data is valid' };
  }

  /**
   * Migrate data from older versions to current format
   */
  private migrateData(data: ExportData, fromVersion: string): ExportData {
    let migratedData = { ...data };

    // Migrate from version 1.0 to 2.0
    if (fromVersion === '1.0') {
      // Ensure all builds have wEngineRefinement field (default to 1)
      migratedData.builds = migratedData.builds.map(build => {
        if (build.wEngineRefinement === undefined) {
          build.wEngineRefinement = 1;
        }
        return build;
      });

      // Ensure W-Engines have the new properties structure
      migratedData.builds = migratedData.builds.map(build => {
        if (build.equippedWEngine && !build.equippedWEngine.effect.properties) {
          // Old W-Engine format - properties will be added when reference data is loaded
        }
        return build;
      });
    }

    // Migrate from version 2.0 to 3.0
    if (fromVersion === '2.0' || fromVersion === '1.0') {
      // Version 3.0 adds loadouts support
      // Initialize loadouts array if not present (will be empty for old exports)
      if (!migratedData.loadouts) {
        migratedData.loadouts = [];
      }

      // Ensure all builds have the new optional fields with defaults
      migratedData.builds = migratedData.builds.map(build => {
        // enabledDiscs defaults to all enabled (true for all slots)
        if (build.enabledDiscs === undefined) {
          build.enabledDiscs = {};
        }
        // activeUpgradePlanId is optional, no default needed
        return build;
      });
    }

    // Update version to current
    migratedData.version = this.EXPORT_VERSION;

    return migratedData;
  }

  /**
   * Read file from input element
   */
  async readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          resolve(e.target.result as string);
        } else {
          reject(new Error('Failed to read file'));
        }
      };
      reader.onerror = () => reject(new Error('File reading error'));
      reader.readAsText(file);
    });
  }
}
