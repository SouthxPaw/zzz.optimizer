import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DataImportService } from './data-import.service';
import { LoadingService } from './loading.service';
import { NotificationService } from './notification.service';
import { BuildService } from './build.service';

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
    private buildService: BuildService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  /**
   * Initialize the app by loading reference data
   * This should be called once when the app starts
   */
  async initialize(): Promise<void> {
    // Only run in browser, not during SSR
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (this.initialized) {
      return;
    }

    this.loadingService.show('Initializing ZZZ Optimizer...');

    try {
      // Check if reference data needs to be loaded or reloaded (version mismatch)
      const needsReload = await this.checkNeedsDataReload();

      if (needsReload) {
        const hasExistingData = await this.dataImport.hasReferenceData();
        if (hasExistingData) {
          this.loadingService.show('Updating game data for new version...');
          // Clear old data first
          await this.dataImport.clearReferenceData();
        } else {
          this.loadingService.show('Loading game data...');
        }
        await this.loadReferenceData();
        this.notificationService.success('Game data loaded successfully!');
      }

      this.initialized = true;
    } catch (error) {
      console.error('Error initializing app:', error);
      this.notificationService.error('Failed to load game data. Please refresh the page.');
      // Don't throw - app should still work even if reference data fails
    } finally {
      this.loadingService.hide();
    }
  }

  /**
   * Check if reference data needs to be loaded/reloaded
   * Returns true if no data exists OR if app version changed
   */
  private async checkNeedsDataReload(): Promise<boolean> {
    try {
      return await this.dataImport.needsDataReload();
    } catch {
      return true; // If check fails, assume we need to reload
    }
  }

  /**
   * Load reference data from assets folder
   */
  private async loadReferenceData(): Promise<void> {
    try {
      const results = await this.dataImport.importReferenceDataFromIndividualFiles();
    } catch (error) {
      console.error('Error loading reference data:', error);
      throw error;
    }
  }

  /**
   * Force reload reference data (useful for updates)
   */
  async reloadReferenceData(): Promise<void> {
    try {
      this.loadingService.show('Clearing old data...');

      // Clear existing reference data
      await this.dataImport.clearReferenceData();
      this.initialized = false;

      // Force reload from assets (bypass the hasData check)
      this.loadingService.show('Loading fresh data from assets...');
      await this.loadReferenceData();

      this.initialized = true;
      this.notificationService.success('Reference data reloaded successfully!');

      // Recalculate all existing builds to use updated agent base stats
      this.loadingService.show('Recalculating builds...');
      await this.buildService.recalculateAllBuilds();

      this.notificationService.success('All builds updated with new data!');
    } catch (error) {
      console.error('Error reloading reference data:', error);
      this.notificationService.error('Failed to reload reference data. Please check console for details.');
      throw error;
    } finally {
      this.loadingService.hide();
    }
  }
}
