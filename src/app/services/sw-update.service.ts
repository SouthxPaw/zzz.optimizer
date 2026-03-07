// services/sw-update.service.ts
import { Injectable, ApplicationRef, OnDestroy } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { concat, interval, Subject, fromEvent, merge } from 'rxjs';
import { first, takeUntil, switchMap, filter, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/**
 * Service Worker Update Service
 * Handles automatic updates with smart detection (hourly + on visibility change)
 * Also detects version changes and forces cache clear automatically
 */
@Injectable({
  providedIn: 'root'
})
export class SwUpdateService implements OnDestroy {
  private destroy$ = new Subject<void>();
  private readonly VERSION_KEY = 'app_version';

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

    // Tab becomes visible (not hidden)
    const tabVisible$ = fromEvent(document, 'visibilitychange').pipe(
      filter(() => !document.hidden),
      map(() => void 0) // Normalize to void for consistency
    );

    // Window gains focus
    const windowFocus$ = fromEvent(window, 'focus').pipe(
      map(() => void 0) // Normalize to void for consistency
    );

    // Combine all update triggers into a single stream
    const allUpdateTriggers$ = merge(
      everyHourOnceAppIsStable$,
      tabVisible$,
      windowFocus$
    );

    // Single subscription handles ALL update triggers with consistent logic
    allUpdateTriggers$.pipe(
      takeUntil(this.destroy$),
      switchMap(() => {
        // Add timestamp to bust browser cache for ngsw.json
        // This ensures we always check the server for new versions
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[SW Update] ${timestamp} - Update check triggered`);
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

    // Listen for version ready events and auto-reload
    this.swUpdate.versionUpdates.pipe(
      takeUntil(this.destroy$)
    ).subscribe(async evt => {
      if (evt.type === 'VERSION_READY') {
        console.log('[SW Update] New version ready - clearing caches and reloading');

        // Clear all caches before reloading to ensure fresh data
        try {
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
      const cacheBuster = Date.now();
      const ngswUrl = `/ngsw.json?v=${cacheBuster}`;

      console.log('[SW Update] Fetching fresh ngsw.json from server...');

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
      const serverHash = serverManifest?.hash;

      if (!serverHash) {
        console.warn('[SW Update] Server manifest missing hash');
        return false;
      }

      console.log('[SW Update] Server version hash:', serverHash.substring(0, 8) + '...');

      // Get currently installed version
      const installedHash = await this.getInstalledVersionHash();

      if (!installedHash) {
        console.log('[SW Update] Could not determine installed version, triggering check');
        // Can't compare, let Angular try
        return await this.swUpdate.checkForUpdate();
      }

      console.log('[SW Update] Installed version hash:', installedHash.substring(0, 8) + '...');

      // Compare versions
      if (serverHash !== installedHash) {
        console.log('[SW Update] 🎉 NEW VERSION DETECTED! Reloading page...');

        // Clear ALL caches before reload to ensure fresh content
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => {
            console.log('[SW Update] Clearing cache:', cacheName);
            return caches.delete(cacheName);
          })
        );

        // Reload page - this triggers navigation event which Angular SW handles correctly
        setTimeout(() => window.location.reload(), 500);
        return true;
      } else {
        console.log('[SW Update] Already on latest version');
        return false;
      }
    } catch (err) {
      console.error('[SW Update] Error checking for updates:', err);
      return false;
    }
  }

  /**
   * Get the hash of the currently installed Service Worker version
   * This reads from the SW's internal storage
   */
  private async getInstalledVersionHash(): Promise<string | null> {
    try {
      // The SW stores its version in a cache called 'ngsw:<hash>:db:control'
      const cacheNames = await caches.keys();

      // Find the control cache
      const controlCache = cacheNames.find(name =>
        name.startsWith('ngsw:') && name.includes(':db:control')
      );

      if (!controlCache) {
        console.warn('[SW Update] No control cache found');
        return null;
      }

      // Extract hash from cache name: 'ngsw:<hash>:db:control'
      const hashMatch = controlCache.match(/ngsw:([^:]+):/);
      if (hashMatch && hashMatch[1]) {
        return hashMatch[1];
      }

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
}
