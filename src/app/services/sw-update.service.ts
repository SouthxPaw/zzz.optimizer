// services/sw-update.service.ts
import { Injectable, ApplicationRef, OnDestroy } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { interval, Subject, BehaviorSubject, Observable } from 'rxjs';
import { first, takeUntil, switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/**
 * Service Worker Update Service
 * Handles automatic updates with 30-minute background checks
 * Shows update notification button instead of auto-reloading
 */
@Injectable({
  providedIn: 'root'
})
export class SwUpdateService implements OnDestroy {
  private destroy$ = new Subject<void>();
  private readonly VERSION_KEY = 'app_version';
  private readonly INSTALLED_TIMESTAMP_KEY = 'installed_ngsw_timestamp';
  private readonly HARD_RELOAD_FLAG = 'sw_needs_hard_reload';
  private readonly EXPECTING_UPDATE_KEY = 'sw_expecting_update'; // Persist across reloads
  private readonly BROKEN_SW_TIMEOUT_MS = 60000; // 60 seconds

  // Observable to track if an update is available
  private updateAvailable$ = new BehaviorSubject<boolean>(false);

  // Track if we're waiting for VERSION_READY
  private waitingForVersionReady = false;
  private versionReadyTimeout: any;

  // Track update retry attempts for hash mismatch issues
  private updateRetryCount = 0;
  private readonly MAX_UPDATE_RETRIES = 3;

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

    // Clear the expecting update flag if we're already on the latest version
    // This prevents showing the update button when user refreshes and loads the new version
    await this.clearExpectingUpdateIfCurrent();

    if (!this.swUpdate.isEnabled) {
      console.log('Service Worker is not enabled');
      return;
    }

    // Wait for app to become stable, then start 30-minute interval checks
    const appIsStable$ = this.appRef.isStable.pipe(
      first(isStable => isStable === true)
    );

    // Start 30-minute interval AFTER app is stable (no immediate check on page load)
    appIsStable$.pipe(
      takeUntil(this.destroy$),
      switchMap(() => {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[SW Update] ${timestamp} - App is stable - starting 30-minute update check interval`);
        // Only start the interval, don't check immediately on page load
        return interval(30 * 60 * 1000);
      }),
      switchMap(() => {
        // Check for new version by comparing server and installed timestamps
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[SW Update] ${timestamp} - Update check triggered (30min interval)`);
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

    // Listen for version update events
    this.swUpdate.versionUpdates.pipe(
      takeUntil(this.destroy$)
    ).subscribe(async evt => {
      if (evt.type === 'VERSION_READY') {
        // Check localStorage flag to see if we're expecting an update
        const expectingUpdate = localStorage.getItem(this.EXPECTING_UPDATE_KEY) === 'true';
        console.log(`[SW Update] VERSION_READY received (expecting from localStorage: ${expectingUpdate})`);

        // Only show update button if we detected an update from a background check
        // This prevents the button from showing on page refresh/SW activation
        if (!expectingUpdate) {
          console.log('[SW Update] VERSION_READY received but not from background check - ignoring');
          return;
        }

        console.log('[SW Update] New version ready - showing update notification');

        // Clear the timeout since VERSION_READY fired successfully
        if (this.versionReadyTimeout) {
          clearTimeout(this.versionReadyTimeout);
          this.versionReadyTimeout = null;
        }
        this.waitingForVersionReady = false;

        // Reset retry count on success
        this.updateRetryCount = 0;

        // Show the update button to let user reload when ready
        // Store the new timestamp so we know this version is installed
        const baseUrl = document.baseURI || window.location.origin + window.location.pathname;
        const ngswUrl = new URL('ngsw.json', baseUrl).href + `?v=${Date.now()}`;

        try {
          const response = await fetch(ngswUrl, { cache: 'no-store' });
          const manifest = await response.json();
          if (manifest?.timestamp) {
            localStorage.setItem(this.INSTALLED_TIMESTAMP_KEY, manifest.timestamp.toString());
          }
        } catch (err) {
          console.warn('[SW Update] Could not update installed timestamp:', err);
        }

        // Show update button immediately
        this.updateAvailable$.next(true);
      } else if (evt.type === 'VERSION_INSTALLATION_FAILED') {
        console.warn('[SW Update] Installation failed (likely GitHub Pages CDN cache issue):', evt.error);

        // Clear timeout since we got a response (even if failed)
        if (this.versionReadyTimeout) {
          clearTimeout(this.versionReadyTimeout);
          this.versionReadyTimeout = null;
        }
        this.waitingForVersionReady = false;

        // Retry after delay to give GitHub Pages CDN time to propagate all files
        if (this.updateRetryCount < this.MAX_UPDATE_RETRIES) {
          this.updateRetryCount++;
          console.log(`[SW Update] Retrying in 10 seconds (attempt ${this.updateRetryCount}/${this.MAX_UPDATE_RETRIES})...`);

          setTimeout(() => {
            console.log('[SW Update] Retry attempt starting now');
            this.bustCacheAndCheckForUpdate();
          }, 10000);
        } else {
          console.error('[SW Update] Max retries reached - forcing nuclear SW replacement');
          this.updateRetryCount = 0; // Reset for next time
          await this.forceNuclearSwReplacement();
        }
      } else if (evt.type === 'NO_NEW_VERSION_DETECTED') {
        console.log('[SW Update] No new version detected');

        // Clear timeout if running
        if (this.versionReadyTimeout) {
          clearTimeout(this.versionReadyTimeout);
          this.versionReadyTimeout = null;
        }
        this.waitingForVersionReady = false;

        // Check if we're expecting an update (manual fetch detected new version)
        // but Angular SW didn't detect it (GitHub Pages CDN inconsistency)
        const expectingUpdate = localStorage.getItem(this.EXPECTING_UPDATE_KEY) === 'true';
        if (expectingUpdate) {
          console.log('[SW Update] Manual check found update but Angular SW did not - showing button anyway');
          // Show the update button since our manual check found a new version
          this.updateAvailable$.next(true);
        } else {
          console.log('[SW Update] Not clearing update button (if showing, it\'s legitimate)');
        }
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
        console.log(`[SW Update] Version changed from ${storedVersion} to ${currentVersion} - clearing non-SW caches`);

        // Clear the expecting update flag since we're now on the new version
        localStorage.removeItem(this.EXPECTING_UPDATE_KEY);
        console.log('[SW Update] Cleared expecting update flag (version updated)');

        // Clear localStorage except for USER DATA and SW-related keys
        // USER DATA TO PRESERVE:
        // - zzz-optimizer-builds: All user's character builds (agents + equipped gear)
        // - zzz-optimizer-upgrade-plans: User's custom upgrade plans
        // - zzz_uid_history: Recent UID search history
        const keysToPreserve = [
          'zzz-optimizer-builds',
          'zzz-optimizer-upgrade-plans',
          'zzz_uid_history',
          this.VERSION_KEY,
          this.INSTALLED_TIMESTAMP_KEY
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
        console.log('[SW Update] 🎉 NEW VERSION DETECTED! Triggering download...');
        console.log('[SW Update] Server is newer:', serverTimestamp, 'vs', installedTimestamp);

        // Set localStorage flag so VERSION_READY knows this is from a background check
        // This persists across page reloads, unlike in-memory variables
        console.log('[SW Update] Setting localStorage flag: sw_expecting_update = true');
        localStorage.setItem(this.EXPECTING_UPDATE_KEY, 'true');

        // Set flag and timeout BEFORE calling checkForUpdate (since VERSION_READY fires immediately)
        if (!this.waitingForVersionReady) {
          this.waitingForVersionReady = true;

          // Start timeout - if VERSION_READY doesn't fire within 60 seconds,
          // the SW is probably broken and can't update itself
          console.log(`[SW Update] Starting ${this.BROKEN_SW_TIMEOUT_MS}ms timeout for VERSION_READY`);
          this.versionReadyTimeout = setTimeout(async () => {
            if (this.waitingForVersionReady) {
              console.error('[SW Update] ⚠️ VERSION_READY never fired - SW is broken and cannot update itself');
              console.log('[SW Update] Forcing nuclear SW replacement...');
              // Clear the flag since update failed
              localStorage.removeItem(this.EXPECTING_UPDATE_KEY);
              await this.forceNuclearSwReplacement();
            }
          }, this.BROKEN_SW_TIMEOUT_MS);
        }

        // Trigger Angular's SW update check to download and activate the new version
        // Angular will automatically call skipWaiting() during install phase
        // The update button will appear when VERSION_READY event is emitted (not here!)
        await this.swUpdate.checkForUpdate();

        // Return true to indicate update was found
        // Note: updateAvailable$ will be set by VERSION_READY listener when SW is ready
        return true;
      } else {
        console.log('[SW Update] Already on latest version');

        // Store the current timestamp so we have it for next check
        localStorage.setItem(this.INSTALLED_TIMESTAMP_KEY, serverTimestamp.toString());

        // Only reset the update available flag if there's no pending update
        // If EXPECTING_UPDATE_KEY is set, it means an update was downloaded and is ready,
        // but the user hasn't applied it yet - keep the button visible!
        const expectingUpdate = localStorage.getItem(this.EXPECTING_UPDATE_KEY) === 'true';
        if (!expectingUpdate) {
          console.log('[SW Update] Resetting update button (no pending update)');
          this.updateAvailable$.next(false);
        } else {
          console.log('[SW Update] Keeping update button visible (pending update not applied yet)');
        }

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
   * Clear the expecting update flag if we're already on the latest version
   * This prevents showing the update button when user refreshes and loads the new version
   */
  private async clearExpectingUpdateIfCurrent(): Promise<void> {
    try {
      const expectingUpdate = localStorage.getItem(this.EXPECTING_UPDATE_KEY) === 'true';
      if (!expectingUpdate) {
        return; // Nothing to do
      }

      // Compare current installed version with server version
      const installedTimestamp = await this.getInstalledVersionTimestamp();
      if (!installedTimestamp) {
        // Can't determine, clear the flag to be safe
        console.log('[SW Update] Cannot determine installed version - clearing expecting update flag');
        localStorage.removeItem(this.EXPECTING_UPDATE_KEY);
        return;
      }

      // Fetch server version
      const baseUrl = document.baseURI || window.location.origin + window.location.pathname;
      const ngswUrl = new URL('ngsw.json', baseUrl).href + `?v=${Date.now()}`;
      const response = await fetch(ngswUrl, { cache: 'no-store' });
      const manifest = await response.json();
      const serverTimestamp = manifest?.timestamp;

      if (!serverTimestamp) {
        console.log('[SW Update] Cannot determine server version - clearing expecting update flag');
        localStorage.removeItem(this.EXPECTING_UPDATE_KEY);
        return;
      }

      // If we're already on the latest version, clear the flag
      if (installedTimestamp >= serverTimestamp) {
        console.log('[SW Update] Already on latest version - clearing expecting update flag');
        localStorage.removeItem(this.EXPECTING_UPDATE_KEY);
      } else {
        console.log('[SW Update] Update still pending:', installedTimestamp, '<', serverTimestamp);
      }
    } catch (err) {
      // If we can't check, clear the flag to avoid showing stale update button
      console.log('[SW Update] Error checking version - clearing expecting update flag:', err);
      localStorage.removeItem(this.EXPECTING_UPDATE_KEY);
    }
  }

  /**
   * Force nuclear SW replacement
   * Completely unregisters all SWs, clears all caches, and reloads
   */
  private async forceNuclearSwReplacement(): Promise<void> {
    try {
      console.log('[SW Update] 💥 NUCLEAR OPTION: Unregistering all SWs and clearing all caches');

      // Clear timeout and flag
      if (this.versionReadyTimeout) {
        clearTimeout(this.versionReadyTimeout);
        this.versionReadyTimeout = null;
      }
      this.waitingForVersionReady = false;

      // Unregister ALL service workers
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
        console.log('[SW Update] ✓ Unregistered service worker');
      }

      // Clear ALL caches (including broken SW caches)
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      console.log('[SW Update] ✓ Cleared all caches');

      // Clear the installed timestamp so we start fresh
      localStorage.removeItem(this.INSTALLED_TIMESTAMP_KEY);

      // Reload - page will load WITHOUT a service worker
      // Then Angular will install the NEW service worker on this fresh load
      console.log('[SW Update] ✓ Reloading to get fresh service worker...');
      window.location.reload();
    } catch (err) {
      console.error('[SW Update] ❌ Error during nuclear SW replacement:', err);
      // Still try to reload even if something failed
      window.location.reload();
    }
  }

  /**
   * Apply the update (reload the page)
   * Clears all caches before reloading
   */
  async applyUpdate(): Promise<void> {
    console.log('[SW Update] Applying update - reloading to use new service worker');

    try {
      // Clear the installed timestamp so next load will pick up the new version
      localStorage.removeItem(this.INSTALLED_TIMESTAMP_KEY);

      // Clear the expecting update flag so VERSION_READY on next page load won't show button
      console.log('[SW Update] Clearing localStorage flag: sw_expecting_update');
      localStorage.removeItem(this.EXPECTING_UPDATE_KEY);

      // NOTE: We don't unregister the service worker here because we already
      // activated the new one when we detected the update. We just need to reload
      // to start using it.

      // Clear all browser caches to prevent loading old chunks
      // This fixes "error loading dynamically imported module" errors
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        console.log('[SW Update] Clearing browser caches:', cacheNames);
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }

    } catch (err) {
      console.error('[SW Update] Failed to prepare update:', err);
    }

    // Hard reload - bypasses ALL caches (browser cache, service worker cache, etc.)
    // This prevents "error loading dynamically imported module" errors where
    // the app tries to load old chunk files that no longer exist after an update
    console.log('[SW Update] Performing hard reload (bypass cache)');
    window.location.reload();
  }
}
