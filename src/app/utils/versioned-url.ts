import { environment } from '../../environments/environment';

/**
 * Appends the app version as a query parameter to asset URLs for cache busting.
 * When you update the version in package.json and rebuild, browsers will fetch fresh copies.
 *
 * @param url - The asset URL (e.g., 'assets/data/agents.json')
 * @returns The URL with version query param (e.g., 'assets/data/agents.json?v=2.2.0')
 */
export function versionedUrl(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${environment.appVersion}`;
}
