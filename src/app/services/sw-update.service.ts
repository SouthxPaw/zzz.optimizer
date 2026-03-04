// services/sw-update.service.ts
import { Injectable, ApplicationRef, OnDestroy } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { concat, interval, Subject } from 'rxjs';
import { first, takeUntil, switchMap } from 'rxjs/operators';

/**
 * Service Worker Update Service
 * Handles automatic updates with smart detection (hourly + on visibility change)
 */
@Injectable({
  providedIn: 'root'
})
export class SwUpdateService implements OnDestroy {
  private destroy$ = new Subject<void>();
  private visibilityChangeHandler = () => {
    if (!document.hidden) {
      this.checkForUpdate();
    }
  };
  private focusHandler = () => {
    this.checkForUpdate();
  };

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

    everyHourOnceAppIsStable$.pipe(
      takeUntil(this.destroy$),
      switchMap(() => this.swUpdate.checkForUpdate())
    ).subscribe({
      next: (updateFound) => {
        if (updateFound) {
          console.log('New version available');
        } else {
          console.log('App is up to date');
        }
      },
      error: (err) => {
        console.error('Failed to check for updates:', err);
      }
    });

    // Listen for version ready events
    this.swUpdate.versionUpdates.pipe(
      takeUntil(this.destroy$)
    ).subscribe(evt => {
      if (evt.type === 'VERSION_READY') {
        console.log('[SW Update] New version ready');
      }
    });

    // Listen for unrecoverable state
    this.swUpdate.unrecoverable.pipe(
      takeUntil(this.destroy$)
    ).subscribe(event => {
      console.error('Service Worker unrecoverable state:', event.reason);
      this.notifyUnrecoverableState(
        'An error occurred that cannot be recovered from.\n' +
        'Please reload the page to continue.'
      );
    });

    // Check for updates when user returns to tab
    document.addEventListener('visibilitychange', this.visibilityChangeHandler);

    // Check for updates when window regains focus
    window.addEventListener('focus', this.focusHandler);
  }

  /**
   * Cleanup subscriptions and event listeners
   */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
    window.removeEventListener('focus', this.focusHandler);
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
