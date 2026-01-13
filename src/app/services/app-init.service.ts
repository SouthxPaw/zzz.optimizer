import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DataImportService } from './data-import.service';
import { LoadingService } from './loading.service';
import { NotificationService } from './notification.service';

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
    private loadingService: LoadingService,
    private notificationService: NotificationService,
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
    this.loadingService.show('Initializing ZZZ Optimizer...');

    try {
      // Check if reference data already exists in IndexedDB
      const hasData = await this.checkReferenceData();

      if (!hasData) {
        console.log('No reference data found. Loading from assets...');
        this.loadingService.show('Loading game data...');
        await this.loadReferenceData();
        this.notificationService.success('Game data loaded successfully!');
      } else {
        console.log('Reference data already loaded');
      }

      this.initialized = true;
      console.log('ZZZ Optimizer initialized successfully');
    } catch (error) {
      console.error('Error initializing app:', error);
      this.notificationService.error('Failed to load game data. Please refresh the page.');
      // Don't throw - app should still work even if reference data fails
    } finally {
      this.loadingService.hide();
    }
  }

  /**
   * Check if reference data exists in IndexedDB
   */
  private async checkReferenceData(): Promise<boolean> {
    try {
      return await this.dataImport.hasReferenceData();
    } catch {
      return false;
    }
  }

  /**
   * Load reference data from assets folder
   */
  private async loadReferenceData(): Promise<void> {
    try {
      console.log('Loading reference data from individual JSON files...');
      const results = await this.dataImport.importReferenceDataFromIndividualFiles();

      console.log(`✓ Reference data loaded successfully: ${results.agents} agents, ${results.wEngines} W-Engines`);
    } catch (error) {
      console.error('Error loading reference data:', error);
      throw error;
    }
  }

  /**
   * Force reload reference data (useful for updates)
   */
  async reloadReferenceData(): Promise<void> {
    await this.dataImport.clearReferenceData();
    this.initialized = false;
    await this.initialize();
  }
}
