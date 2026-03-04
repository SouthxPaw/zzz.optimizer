// services/sw-update.service.ts
import { Injectable, ApplicationRef } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, concat, interval } from 'rxjs';
import { first } from 'rxjs/operators';

/**
 * Service Worker Update Service
 * Handles automatic updates with smart detection (hourly + on visibility change)
 */
@Injectable({
  providedIn: 'root'
})
export class SwUpdateService {
  constructor(
    private swUpdate: SwUpdate,
    private appRef: ApplicationRef
  ) {}

  /**
   * Initialize service worker update checking
   * Call this from app initialization
   */
  init(): void {
    if (!this.swUpdate.isEnabled) {
      console.log('Service Worker is not enabled');
      return;
    }

    // Check for updates when app becomes stable
    const appIsStable$ = this.appRef.isStable.pipe(
      first(isStable => isStable === true)
    );

    // Check for updates every hour after app is stable
    const everyHour$ = interval(60 * 60 * 1000);
    const everyHourOnceAppIsStable$ = concat(appIsStable$, everyHour$);

    everyHourOnceAppIsStable$.subscribe(async () => {
      try {
        const updateFound = await this.swUpdate.checkForUpdate();
        if (updateFound) {
          console.log('New version available');
        } else {
          console.log('App is up to date');
        }
      } catch (err) {
        console.error('Failed to check for updates:', err);
      }
    });

    // Listen for ALL version update events (for debugging)
    this.swUpdate.versionUpdates.subscribe(evt => {
      console.log('[SW Update] Version event:', evt.type, evt);

      // When VERSION_READY is detected, the service worker will auto-activate
      // due to updateMode: 'prefetch' in ngsw-config.json
      if (evt.type === 'VERSION_READY') {
        console.log('[SW Update] New version ready - will auto-reload');
      }

      // Handle installation failures (e.g., hash mismatches during deployment)
      if (evt.type === 'VERSION_INSTALLATION_FAILED') {
        console.warn('[SW Update] Version installation failed - this may be due to deployment timing');

        // Check if it's a hash mismatch error
        const error = (evt as any).error || '';
        if (error.includes('Hash mismatch')) {
          console.warn('[SW Update] Hash mismatch detected - deployment may still be in progress');
          console.warn('[SW Update] Will retry in 30 seconds...');

          // Retry after a short delay to allow deployment to complete
          setTimeout(() => {
            console.log('[SW Update] Retrying update check after hash mismatch...');
            this.checkForUpdate();
          }, 30000); // 30 seconds
        } else {
          console.warn('[SW Update] Will retry on next scheduled check');
        }
      }
    });

    // Listen for unrecoverable state
    this.swUpdate.unrecoverable.subscribe(event => {
      console.error('Service Worker unrecoverable state:', event.reason);
      this.notifyUnrecoverableState(
        'An error occurred that cannot be recovered from.\n' +
        'Please reload the page to continue.'
      );
    });

    // Check for updates when user returns to tab
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        console.log('[SW Update] Tab became visible - checking for updates');
        this.checkForUpdate();
      }
    });

    // Check for updates when window regains focus
    window.addEventListener('focus', () => {
      console.log('[SW Update] Window focused - checking for updates');
      this.checkForUpdate();
    });
  }


  /**
   * Notify user of unrecoverable state
   */
  private notifyUnrecoverableState(message: string): void {
    if (confirm(message)) {
      document.location.reload();
    }
  }

  /**
   * Manually check for updates
   * Can be called from UI button
   */
  async checkForUpdate(): Promise<boolean> {
    if (!this.swUpdate.isEnabled) {
      return false;
    }

    try {
      return await this.swUpdate.checkForUpdate();
    } catch (err) {
      console.error('Error checking for updates:', err);
      return false;
    }
  }
}
