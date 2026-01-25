// services/sw-update.service.ts
import { Injectable, ApplicationRef } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, concat, interval } from 'rxjs';
import { first } from 'rxjs/operators';

/**
 * Service Worker Update Service
 * Handles automatic updates and user notifications for new app versions
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

    // Check for updates every 6 hours after app is stable
    const everySixHours$ = interval(6 * 60 * 60 * 1000);
    const everySixHoursOnceAppIsStable$ = concat(appIsStable$, everySixHours$);

    everySixHoursOnceAppIsStable$.subscribe(async () => {
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

    // Listen for version updates
    this.swUpdate.versionUpdates
      .pipe(
        filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY')
      )
      .subscribe(evt => {
        console.log('New version detected:', evt.latestVersion);
        this.promptUserToUpdate();
      });

    // Listen for unrecoverable state
    this.swUpdate.unrecoverable.subscribe(event => {
      console.error('Service Worker unrecoverable state:', event.reason);
      this.notifyUnrecoverableState(
        'An error occurred that cannot be recovered from.\n' +
        'Please reload the page to continue.'
      );
    });
  }

  /**
   * Prompt user to reload for new version
   */
  private promptUserToUpdate(): void {
    const message =
      'A new version of ZZZ Optimizer is available!\n' +
      'Would you like to reload to get the latest features and improvements?';

    if (confirm(message)) {
      this.activateUpdate();
    }
  }

  /**
   * Activate the waiting service worker and reload
   */
  private async activateUpdate(): Promise<void> {
    try {
      await this.swUpdate.activateUpdate();
      document.location.reload();
    } catch (err) {
      console.error('Failed to activate update:', err);
    }
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
