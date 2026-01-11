import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DataImportService } from './data-import.service';

/**
 * Service to handle app initialization
 * Automatically loads reference data (agents, wengines, disc sets) on first run
 */
@Injectable({
  providedIn: 'root'
})
export class AppInitService {
  private initialized = false;

  constructor(
    private dataImport: DataImportService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  /**
   * Initialize the app by loading reference data
   * This should be called once when the app starts
   */
  async initialize(): Promise<void> {
    // Only run in browser, not during SSR
    if (!isPlatformBrowser(this.platformId)) {
      console.log('Skipping initialization - running in SSR');
      return;
    }

    if (this.initialized) {
      console.log('App already initialized');
      return;
    }

    console.log('Initializing ZZZ Optimizer...');

    try {
      // Check if reference data already exists in IndexedDB
      const hasData = await this.checkReferenceData();

      if (!hasData) {
        console.log('No reference data found. Loading from assets...');
        await this.loadReferenceData();
      } else {
        console.log('Reference data already loaded');
      }

      this.initialized = true;
      console.log('ZZZ Optimizer initialized successfully');
    } catch (error) {
      console.error('Error initializing app:', error);
      // Don't throw - app should still work even if reference data fails
    }
  }

  /**
   * Check if reference data exists in IndexedDB
   */
  private async checkReferenceData(): Promise<boolean> {
    try {
      // Check localStorage flag
      const lastLoaded = localStorage.getItem('zzz-optimizer-reference-data-loaded');
      return lastLoaded !== null;
    } catch {
      return false;
    }
  }

  /**
   * Load reference data from assets folder
   */
  private async loadReferenceData(): Promise<void> {
    try {
      console.log('Loading agents from assets/data/agents.json...');
      const agentCount = await this.dataImport.importAgentsFromFile('assets/data/agents.json', true);
      console.log(`✓ Successfully loaded ${agentCount} agents`);

      console.log('Loading W-Engines from assets/data/wengines.json...');
      const wEngineCount = await this.dataImport.importWEnginesFromFile('assets/data/wengines.json', true);
      console.log(`✓ Successfully loaded ${wEngineCount} W-Engines`);

      // Mark reference data as loaded
      localStorage.setItem('zzz-optimizer-reference-data-loaded', new Date().toISOString());

      console.log(`Reference data loaded successfully: ${agentCount} agents, ${wEngineCount} W-Engines`);
    } catch (error) {
      console.error('Error loading reference data:', error);
      throw error;
    }
  }

  /**
   * Force reload reference data (useful for updates)
   */
  async reloadReferenceData(): Promise<void> {
    localStorage.removeItem('zzz-optimizer-reference-data-loaded');
    this.initialized = false;
    await this.initialize();
  }
}
