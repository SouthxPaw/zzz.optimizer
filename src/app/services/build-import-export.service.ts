import { Injectable } from '@angular/core';
import { BuildService, AgentBuild } from './build.service';
import { DiscService } from './disc.service';
import { Disc } from '../models/disc.model';

export interface ExportData {
  version: string;
  exportDate: string;
  builds: AgentBuild[];
  discs: Disc[];
}

@Injectable({
  providedIn: 'root'
})
export class BuildImportExportService {
  private readonly EXPORT_VERSION = '1.0';

  constructor(
    private buildService: BuildService,
    private discService: DiscService
  ) { }

  /**
   * Export all builds and discs to JSON
   */
  async exportBuilds(): Promise<string> {
    const builds = await this.buildService.getAllBuilds();
    const discs = await this.discService.getAllDiscs();

    const exportData: ExportData = {
      version: this.EXPORT_VERSION,
      exportDate: new Date().toISOString(),
      builds: builds,
      discs: discs
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
    link.download = `zzz-optimizer-builds-${new Date().toISOString().split('T')[0]}.json`;
    link.click();

    URL.revokeObjectURL(url);
  }

  /**
   * Import builds from JSON data
   */
  async importBuilds(jsonData: string, replaceExisting: boolean = false): Promise<{ success: boolean; message: string; buildsImported: number; discsImported: number }> {
    try {
      const data: ExportData = JSON.parse(jsonData);

      // Validate data structure
      if (!data.version || !data.builds || !data.discs) {
        return {
          success: false,
          message: 'Invalid import file format',
          buildsImported: 0,
          discsImported: 0
        };
      }

      // If replacing, clear existing data
      if (replaceExisting) {
        await this.buildService.clearAllBuilds();
        await this.discService.clearAllDiscs();
      }

      // Import discs first (builds reference them)
      let discsImported = 0;
      for (const disc of data.discs) {
        try {
          await this.discService.addDisc(disc);
          discsImported++;
        } catch (error) {
          console.warn('Failed to import disc:', disc, error);
        }
      }

      // Import builds
      let buildsImported = 0;
      for (const build of data.builds) {
        try {
          await this.buildService.importBuild(build);
          buildsImported++;
        } catch (error) {
          console.warn('Failed to import build:', build, error);
        }
      }

      return {
        success: true,
        message: `Successfully imported ${buildsImported} builds and ${discsImported} discs`,
        buildsImported,
        discsImported
      };
    } catch (error) {
      return {
        success: false,
        message: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        buildsImported: 0,
        discsImported: 0
      };
    }
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
