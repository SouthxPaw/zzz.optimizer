// services/sw-update.service.ts
import { Injectable, ApplicationRef, OnDestroy } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { concat, interval, Subject, BehaviorSubject, Observable } from 'rxjs';
import { first, takeUntil, switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/**
 * Service Worker Update Service
 * Handles automatic updates with hourly checks
 * Shows update notification button instead of auto-reloading
 */
@Injectable({
  providedIn: 'root'
})
export class SwUpdateService implements OnDestroy {
  private destroy$ = new Subject<void>();
  private readonly VERSION_KEY = 'app_version';
  private readonly INSTALLED_TIMESTAMP_KEY = 'installed_ngsw_timestamp';

  // Observable to track if an update is available
  private updateAvailable$ = new BehaviorSubject<boolean>(false);

  // Public observable for components to subscribe to
  public get updateAvailable(): Observable<boolean> {
    return this.updateAvailable$.asObservable();
  }

  constructor(
    private swUpdate: SwUpdate,
    private appRef: ApplicationRef
  ) {}

  /**
   * Initialize service worker update checking
   * Call this from app initialization
   */
  async init(): Promise<void> {
    // Check if app version has changed and clear caches if needed
    await this.checkVersionAndClearCaches();

    // Check for broken service worker and unregister if needed
    await this.checkForBrokenServiceWorker();

    if (!this.swUpdate.isEnabled) {
      console.log('Service Worker is not enabled');
      return;
    }

    // Perform immediate update check on app load
    console.log('[SW Update] Performing immediate update check on app initialization');
    this.bustCacheAndCheckForUpdate().catch(err => {
      console.error('[SW Update] Initial update check failed:', err);
    });

    // Check for updates when app becomes stable
    const appIsStable$ = this.appRef.isStable.pipe(
      first(isStable => isStable === true)
    );

    // Check for updates every hour after app is stable
    const everyHour$ = interval(60 * 60 * 1000);
    const everyHourOnceAppIsStable$ = concat(appIsStable$, everyHour$);

    // Subscribe to hourly update checks
    everyHourOnceAppIsStable$.pipe(
      takeUntil(this.destroy$),
      switchMap(() => {
        // Check for new version by comparing server and installed timestamps
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[SW Update] ${timestamp} - Hourly update check triggered`);
        return this.bustCacheAndCheckForUpdate();
      })
    ).subscribe({
      next: (updateFound) => {
        const timestamp = new Date().toLocaleTimeString();
        if (updateFound) {
          console.log(`[SW Update] ${timestamp} - ✅ New version available`);
        } else {
          console.log(`[SW Update] ${timestamp} - ℹ️ App is up to date`);
        }
      },
      error: (err) => {
        console.error('[SW Update] Failed to check for updates:', err);
      }
    });

    // Listen for version ready events and notify user
    this.swUpdate.versionUpdates.pipe(
      takeUntil(this.destroy$)
    ).subscribe(async evt => {
      if (evt.type === 'VERSION_READY') {
        console.log('[SW Update] New version ready - showing update notification');

        // Set observable to true to show update button
        this.updateAvailable$.next(true);
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
  }

  /**
   * Cleanup subscriptions and event listeners
   */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Check if app version has changed and clear all caches if needed
   * This ensures users never have stale data after updates
   */
  private async checkVersionAndClearCaches(): Promise<void> {
    try {
      const currentVersion = environment.appVersion;
      const storedVersion = localStorage.getItem(this.VERSION_KEY);

      if (storedVersion && storedVersion !== currentVersion) {
        console.log(`[SW Update] Version changed from ${storedVersion} to ${currentVersion} - clearing all caches`);

        // Clear the installed timestamp so next load will detect the new version
        localStorage.removeItem(this.INSTALLED_TIMESTAMP_KEY);

        // Unregister all service workers to ensure fresh install
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const registration of registrations) {
            await registration.unregister();
            console.log('[SW Update] Unregistered service worker');
          }
        }

        // Clear all Service Worker caches (images, fonts, etc.)
        // NOTE: This does NOT affect IndexedDB (ZZZOptimizerDB) which contains:
        // - User's disc inventory (discs table)
        // - Reference data (agents, wEngines, discSets) - will reload from fresh JSON
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => {
            console.log('[SW Update] Deleting cache:', cacheName);
            return caches.delete(cacheName);
          })
        );

        // Clear localStorage except for USER DATA
        // USER DATA TO PRESERVE:
        // - zzz-optimizer-builds: All user's character builds (agents + equipped gear)
        // - zzz-optimizer-upgrade-plans: User's custom upgrade plans
        // - zzz_uid_history: Recent UID search history
        const keysToPreserve = [
          'zzz-optimizer-builds',
          'zzz-optimizer-upgrade-plans',
          'zzz_uid_history'
        ];
        const allKeys = Object.keys(localStorage);
        allKeys.forEach(key => {
          // Only remove if NOT in the preserve list
          if (!keysToPreserve.includes(key)) {
            console.log(`[SW Update] Removing localStorage key: ${key}`);
            localStorage.removeItem(key);
          }
        });

        console.log('[SW Update] Cache clearing complete');

        // Update stored version BEFORE reloading
        localStorage.setItem(this.VERSION_KEY, currentVersion);

        // Reload the page to get fresh service worker with new config
        console.log('[SW Update] Reloading to activate new service worker...');
        window.location.reload();
        return; // Exit early since we're reloading
      }

      // Update stored version
      localStorage.setItem(this.VERSION_KEY, currentVersion);
    } catch (err) {
      console.error('[SW Update] Error checking version:', err);
    }
  }

  /**
   * Check for updates using the SAME mechanism that works on page refresh
   * Key insight: Angular SW checks for updates on NAVIGATION events, not programmatic checks
   * So we fetch ngsw.json ourselves, compare versions, and reload if different
   */
  private async bustCacheAndCheckForUpdate(): Promise<boolean> {
    if (!this.swUpdate.isEnabled) {
      return false;
    }

    try {
      // Fetch fresh ngsw.json from server (bypasses all caches)
      // Use document.baseURI to get correct path (handles /zzz.optimizer/ subdirectory)
      const cacheBuster = Date.now();
      const baseUrl = document.baseURI || window.location.origin + window.location.pathname;
      const ngswUrl = new URL('ngsw.json', baseUrl).href + `?v=${cacheBuster}`;

      console.log('[SW Update] Fetching fresh ngsw.json from:', ngswUrl);

      const response = await fetch(ngswUrl, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });

      if (!response.ok) {
        console.warn('[SW Update] Failed to fetch ngsw.json:', response.status);
        return false;
      }

      const serverManifest = await response.json();
      const serverTimestamp = serverManifest?.timestamp;

      if (!serverTimestamp) {
        console.warn('[SW Update] Server manifest missing timestamp');
        return false;
      }

      console.log('[SW Update] Server version timestamp:', serverTimestamp);

      // Get currently installed version
      const installedTimestamp = await this.getInstalledVersionTimestamp();

      if (!installedTimestamp) {
        console.log('[SW Update] Could not determine installed version - storing server timestamp');

        // First load or cache lookup failed
        // Store the server timestamp as our baseline for future comparisons
        localStorage.setItem(this.INSTALLED_TIMESTAMP_KEY, serverTimestamp.toString());

        // Don't show update notification on first load
        this.updateAvailable$.next(false);

        // Trigger Angular's check in case it can detect a version
        await this.swUpdate.checkForUpdate();
        return false;
      }

      console.log('[SW Update] Installed version timestamp:', installedTimestamp);

      // Compare versions (newer timestamp = new version)
      if (serverTimestamp > installedTimestamp) {
        console.log('[SW Update] 🎉 NEW VERSION DETECTED! Showing update notification...');
        console.log('[SW Update] Server is newer:', serverTimestamp, 'vs', installedTimestamp);

        // Set observable to true to show update button
        this.updateAvailable$.next(true);
        return true;
      } else {
        console.log('[SW Update] Already on latest version');

        // Store the current timestamp so we have it for next check
        localStorage.setItem(this.INSTALLED_TIMESTAMP_KEY, serverTimestamp.toString());

        // Reset the update available flag since we're on the latest version
        this.updateAvailable$.next(false);

        return false;
      }
    } catch (err: any) {
      // Network errors during SW initialization are normal - just log and skip
      if (err?.message?.includes('NetworkError') || err?.message?.includes('fetch')) {
        console.log('[SW Update] Network unavailable or SW not ready, skipping check');
      } else {
        console.error('[SW Update] Error checking for updates:', err);
      }
      return false;
    }
  }

  /**
   * Get the timestamp of the currently installed Service Worker version
   * This reads from localStorage first (most reliable), then falls back to cache lookup
   */
  private async getInstalledVersionTimestamp(): Promise<number | null> {
    try {
      // Strategy 0: Check localStorage first (most reliable)
      const storedTimestamp = localStorage.getItem(this.INSTALLED_TIMESTAMP_KEY);
      if (storedTimestamp) {
        const timestamp = parseInt(storedTimestamp, 10);
        if (!isNaN(timestamp)) {
          console.log('[SW Update] Found installed timestamp in localStorage:', timestamp);
          return timestamp;
        }
      }

      // Strategy 1: Look for cached ngsw.json in Service Worker caches
      const cacheNames = await caches.keys();

      // Try multiple strategies to find the cached ngsw.json
      for (const cacheName of cacheNames) {
        if (cacheName.includes('ngsw:')) {
          const cache = await caches.open(cacheName);

          // Look for ngsw.json in cache keys
          const keys = await cache.keys();
          for (const request of keys) {
            if (request.url.includes('ngsw.json') && !request.url.includes('?')) {
              const response = await cache.match(request);
              if (response) {
                try {
                  const manifest = await response.json();
                  if (manifest?.timestamp) {
                    console.log('[SW Update] Found cached manifest in:', cacheName);
                    // Store it for next time
                    localStorage.setItem(this.INSTALLED_TIMESTAMP_KEY, manifest.timestamp.toString());
                    return manifest.timestamp;
                  }
                } catch {
                  // Not valid JSON, skip
                  continue;
                }
              }
            }
          }
        }
      }

      // Strategy 2: Try direct cache match for ngsw.json
      const baseUrl = document.baseURI || window.location.origin + window.location.pathname;
      const ngswUrl = new URL('ngsw.json', baseUrl).href;

      const cachedResponse = await caches.match(ngswUrl);
      if (cachedResponse) {
        try {
          const manifest = await cachedResponse.json();
          if (manifest?.timestamp) {
            console.log('[SW Update] Found manifest via direct cache match');
            // Store it for next time
            localStorage.setItem(this.INSTALLED_TIMESTAMP_KEY, manifest.timestamp.toString());
            return manifest.timestamp;
          }
        } catch {
          // Not valid JSON
        }
      }

      console.warn('[SW Update] Could not find cached ngsw.json, assuming first load');
      return null;
    } catch (err) {
      console.warn('[SW Update] Error getting installed version:', err);
      return null;
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
    console.log('[SW Update] Manual update check triggered');
    return await this.bustCacheAndCheckForUpdate();
  }

  /**
   * Check for broken service worker (e.g., can't load MP4s) and unregister if needed
   * This helps users stuck with a broken SW that can't update itself
   */
  private async checkForBrokenServiceWorker(): Promise<void> {
    try {
      if (!('serviceWorker' in navigator)) {
        return;
      }

      // Check if we've marked this SW as broken before
      const brokenSwMarker = localStorage.getItem('broken_sw_detected');
      if (brokenSwMarker === 'true') {
        console.log('[SW Update] Broken service worker detected - unregistering...');

        // Unregister all service workers
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
          console.log('[SW Update] Unregistered service worker');
        }

        // Clear all caches
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        console.log('[SW Update] Cleared all caches');

        // Remove the marker and reload
        localStorage.removeItem('broken_sw_detected');
        localStorage.removeItem(this.INSTALLED_TIMESTAMP_KEY);

        console.log('[SW Update] Reloading to get fresh service worker...');
        window.location.reload();
      }
    } catch (err) {
      console.error('[SW Update] Error checking for broken service worker:', err);
    }
  }

  /**
   * Mark service worker as broken (call this if MP4 loading fails repeatedly)
   */
  markServiceWorkerAsBroken(): void {
    localStorage.setItem('broken_sw_detected', 'true');
    console.log('[SW Update] Service worker marked as broken - will unregister on next load');
  }

  /**
   * Apply the update (reload the page)
   * Clears all caches before reloading
   */
  async applyUpdate(): Promise<void> {
    console.log('[SW Update] Applying update - clearing caches and reloading');

    try {
      // Clear the installed timestamp so next load will detect the new version
      localStorage.removeItem(this.INSTALLED_TIMESTAMP_KEY);

      // Unregister all service workers to ensure fresh install
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
          console.log('[SW Update] Unregistered service worker');
        }
      }

      // Clear all caches before reloading to ensure fresh data
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(cacheName => {
          console.log('[SW Update] Deleting cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    } catch (err) {
      console.error('[SW Update] Failed to clear caches:', err);
    }

    // Force reload from server (bypass cache)
    window.location.reload();
  }
}
